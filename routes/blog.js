const { Router } = require("express");
const Blog = require("../models/blog");
const Comment = require("../models/comments");
const User = require("../models/user");
const Notification = require("../models/notification");
const cloudinaryUpload = require("../middlewares/cloudinaryUpload");
const webPushEmitter = require("../services/webPush");

const router = Router();

router.get("/addBlog", (req, res) =>
  res.render("addBlog", {
    user: req.user || null,
    error_msg: req.query.error_msg || null,
    success_msg: req.query.success_msg || null,
  })
);

router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate("createdBy", "fullname email profileImageURL")
      .populate("likes", "fullname profileImageURL");
    const comments = await Comment.find({ blogId: req.params.id })
      .populate("createdBy", "fullname profileImageURL")
      .sort({ createdAt: -1 });
    if (!blog) return res.redirect("/?error_msg=Blog not found");
    return res.render("blog", {
      user: req.user || null,
      blog,
      comments,
      error_msg: req.query.error_msg || null,
      success_msg: req.query.success_msg || null,
    });
  } catch (err) {
    console.error(err);
    return res.redirect("/?error_msg=Failed to load blog");
  }
});

router.post("/", cloudinaryUpload.single("coverImage"), async (req, res) => {
  try {
    if (!req.user) return res.redirect("/blog/addBlog?error_msg=Login required");
    const { title, body } = req.body;
    const blog = await Blog.create({
      body,
      title,
      createdBy: req.user._id,
      coverImage: req.file ? req.file.path : null,
      likes: [],
    });

    // notify followers
    const user = await User.findById(req.user._id).populate("followers");
    for (const follower of user.followers) {
      const notif = await Notification.create({
        recipient: follower._id,
        sender: req.user._id,
        type: "POST",
        blogId: blog._id,
        message: `${req.user.fullname} published a new blog: ${title}`,
      });
      webPushEmitter.emit("notification:send", {
        userId: follower._id,
        payload: {
          title: "New post",
          body: notif.message,
          icon: req.user.profileImageURL,
          image: blog.coverImage,
          url: `/blog/${blog._id}`,
        },
      });
    }
    return res.redirect(`/blog/${blog._id}?success_msg=Blog created`);
  } catch (err) {
    console.error(err);
    return res.redirect("/blog/addBlog?error_msg=Failed to create blog");
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/?error_msg=Please log in");
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.redirect("/?error_msg=Blog not found");
    if (blog.createdBy.toString() !== req.user._id.toString())
      return res.redirect("/?error_msg=Unauthorized");
    await Blog.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ blogId: req.params.id });
    await Notification.deleteMany({ blogId: req.params.id });
    return res.redirect("/?success_msg=Blog deleted");
  } catch (err) {
    console.error(err);
    return res.redirect("/?error_msg=Failed to delete blog");
  }
});

router.post("/:id/like", async (req, res) => {
  try {
    if (!req.user) return res.redirect(`/blog/${req.params.id}?error_msg=Login required`);
    const blog = await Blog.findById(req.params.id).populate("createdBy", "fullname");
    if (!blog) return res.redirect(`/blog/${req.params.id}?error_msg=Blog not found`);
    if (blog.createdBy._id.toString() === req.user._id.toString())
      return res.redirect(`/blog/${req.params.id}?error_msg=Cannot like own blog`);

    const user = await User.findById(req.user._id);
    const isLiked = blog.likes.includes(req.user._id);

    if (isLiked) {
      blog.likes.pull(req.user._id);
      user.likedBlogs.pull(req.params.id);
      await Notification.deleteOne({
        sender: req.user._id,
        recipient: blog.createdBy._id,
        type: "LIKE",
        blogId: req.params.id,
      });
    } else {
      blog.likes.push(req.user._id);
      user.likedBlogs.push(req.params.id);
      const notif = await Notification.create({
        recipient: blog.createdBy._id,
        sender: req.user._id,
        type: "LIKE",
        blogId: req.params.id,
        message: `${req.user.fullname} liked your post: ${blog.title}`,
      });
      webPushEmitter.emit("notification:send", {
        userId: blog.createdBy._id,
        payload: {
          title: "New like",
          body: notif.message,
          icon: req.user.profileImageURL,
          image: blog.coverImage,
          url: `/blog/${blog._id}`,
        },
      });
    }
    await Promise.all([blog.save(), user.save()]);
    return res.redirect(`/blog/${req.params.id}?success_msg=${isLiked ? "Blog unliked" : "Blog liked"}`);
  } catch (err) {
    console.error(err);
    return res.redirect(`/blog/${req.params.id}?error_msg=Failed to like blog`);
  }
});

module.exports = router;
