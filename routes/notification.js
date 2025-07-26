const { Router } = require("express");
const Notification = require("../models/notification");
const User = require("../models/user");
const router = Router();

const renderNotifications = (res, user, notifications, messages = {}) =>
  res.render("notifications", {
    user: user || null,
    notifications,
    success_msg: messages.success_msg || null,
    error_msg: messages.error_msg || null,
  });

router.get("/", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin?error_msg=Login required");
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate("sender", "fullname profileImageURL")
      .populate("blogId", "title coverImage")
      .populate("commentId", "content")
      .sort({ createdAt: -1 });
    renderNotifications(res, req.user, notifications, {
      success_msg: req.query.success_msg,
      error_msg: req.query.error_msg,
    });
  } catch (err) {
    renderNotifications(res, req.user, [], { error_msg: "Failed to load notifications" });
  }
});

router.post("/accept/:id", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin?error_msg=Login required");
    const notif = await Notification.findById(req.params.id);
    if (!notif || notif.recipient.toString() !== req.user._id.toString())
      return res.redirect("/notification?error_msg=Not found");
    if (notif.type !== "FOLLOW_REQUEST" || notif.status !== "PENDING")
      return res.redirect("/notification?error_msg=Invalid");

    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { $addToSet: { followers: notif.sender } }),
      User.findByIdAndUpdate(notif.sender, { $addToSet: { following: req.user._id } }),
      Notification.findByIdAndUpdate(req.params.id, { status: "ACCEPTED" }),
    ]);
    return res.redirect("/notification?success_msg=Follow request accepted");
  } catch (err) {
    res.redirect("/notification?error_msg=Failed to accept");
  }
});

router.post("/reject/:id", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin?error_msg=Login required");
    const notif = await Notification.findById(req.params.id);
    if (!notif || notif.recipient.toString() !== req.user._id.toString())
      return res.redirect("/notification?error_msg=Not found");
    await Notification.findByIdAndUpdate(req.params.id, { status: "REJECTED" });
    return res.redirect("/notification?success_msg=Follow request rejected");
  } catch (err) {
    res.redirect("/notification?error_msg=Failed to reject");
  }
});

router.post("/read/:id", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin?error_msg=Login required");
    await Notification.findByIdAndUpdate(req.params.id, { status: "READ" });
    return res.redirect("/notification?success_msg=Marked as read");
  } catch (err) {
    res.redirect("/notification?error_msg=Failed to mark read");
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Login required" });
    await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

module.exports = router;
