const { Router } = require("express");
const Comment = require("../models/comments");
const Blog = require("../models/blog");
const Notification = require("../models/notification");
const webPushEmitter = require("../services/webPush");

const router = Router();

router.post("/:blogId", async (req, res) => {
  try {
    if (!req.user) return res.redirect(`/blog/${req.params.blogId}?error_msg=Login required`);
    const comment = await Comment.create({
      content: req.body.content,
      blogId: req.params.blogId,
      createdBy: req.user._id,
      likes: [],
    });
    const blog = await Blog.findById(req.params.blogId).populate("createdBy");
    if (blog.createdBy._id.toString() !== req.user._id.toString()) {
      const notif = await Notification.create({
        recipient: blog.createdBy._id,
        sender: req.user._id,
        type: "COMMENT",
        blogId: blog._id,
        commentId: comment._id,
        message: `${req.user.fullname} commented on your post: ${blog.title}`,
      });
      webPushEmitter.emit("notification:send", {
        userId: blog.createdBy._id,
        payload: {
          title: "New comment",
          body: notif.message,
          icon: req.user.profileImageURL,
          image: blog.coverImage,
          url: `/blog/${blog._id}`,
        },
      });
    }
    return res.redirect(`/blog/${req.params.blogId}?success_msg=Comment added`);
  } catch (err) {
    console.error(err);
    return res.redirect(`/blog/${req.params.blogId}?error_msg=Failed to add comment`);
  }
});

router.delete("/:commentId", async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.redirect(`/blog/${req.query.blogId || ''}?error_msg=Comment not found`);
    if (!req.user || comment.createdBy.toString() !== req.user._id.toString())
      return res.redirect(`/blog/${comment.blogId}?error_msg=Unauthorized`);
    await Comment.findByIdAndDelete(req.params.commentId);
    return res.redirect(`/blog/${comment.blogId}?success_msg=Comment deleted`);
  } catch (err) {
    console.error(err);
    return res.redirect(`/blog/${req.query.blogId || ''}?error_msg=Failed to delete comment`);
  }
});

router.post("/:commentId/like", async (req, res) => {
  try {
    if (!req.user) return res.redirect(`/blog/${req.query.blogId || ''}?error_msg=Login required`);
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.redirect(`/blog/${req.query.blogId || ''}?error_msg=Comment not found`);
    if (comment.likes.includes(req.user._id))
      return res.redirect(`/blog/${comment.blogId}?error_msg=Already liked comment`);
    comment.likes.push(req.user._id);
    await comment.save();
    return res.redirect(`/blog/${comment.blogId}?success_msg=Comment liked`);
  } catch (err) {
    console.error(err);
    return res.redirect(`/blog/${req.query.blogId || ''}?error_msg=Failed to like comment`);
  }
});

router.delete("/:commentId/like", async (req, res) => {
  try {
    if (!req.user) return res.redirect(`/blog/${req.query.blogId || ''}?error_msg=Login required`);
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.redirect(`/blog/${req.query.blogId || ''}?error_msg=Comment not found`);
    comment.likes = comment.likes.filter(id => id.toString() !== req.user._id.toString());
    await comment.save();
    return res.redirect(`/blog/${comment.blogId}?success_msg=Comment unliked`);
  } catch (err) {
    console.error(err);
    return res.redirect(`/blog/${req.query.blogId || ''}?error_msg=Failed to unlike comment`);
  }
});

module.exports = router;
