const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const { randomBytes, createHmac } = require("crypto");

const User = require("../models/user");
const Blog = require("../models/blog");
const Comment = require("../models/comments");
const { createTokenForUser } = require("../services/authentication");

const router = Router();

// Multer Config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.resolve("./public/uploads")),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// Utility: Render Profile with Defaults
const renderProfile = (res, user, profileUser, blogs, isFollowing = false, messages = {}) => {
  return res.render("profile", {
    user: user || null,
    profileUser,
    blogs: blogs || [],
    isFollowing,
    success_msg: messages.success_msg || null,
    error_msg: messages.error_msg || null,
  });
};

// GET /profile (logged-in user's profile)
router.get("/", async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/user/signin?error_msg=Please log in to view your profile");
    }

    const profileUser = await User.findById(req.user._id)
      .populate("following", "fullname profileImageURL")
      .populate("followers", "fullname profileImageURL")
      .populate({
        path: "likedBlogs",
        populate: { path: "createdBy", select: "fullname profileImageURL" },
      });

    const blogs = await Blog.find({ createdBy: req.user._id })
      .populate("createdBy", "fullname profileImageURL")
      .populate("likes", "fullname profileImageURL")
      .sort({ createdAt: -1 });

    renderProfile(res, req.user, profileUser, blogs, false, {
      success_msg: req.query.success_msg,
      error_msg: req.query.error_msg,
    });
  } catch (err) {
    console.error("Error loading profile:", err);
    renderProfile(res, req.user, null, [], false, { error_msg: "Failed to load profile" });
  }
});

// GET /profile/:id (other user's profile)
router.get("/:id", async (req, res) => {
  try {
    const profileUser = await User.findById(req.params.id)
      .populate("following", "fullname profileImageURL")
      .populate("followers", "fullname profileImageURL")
      .populate({
        path: "likedBlogs",
        populate: { path: "createdBy", select: "fullname profileImageURL" },
      });

    if (!profileUser) {
      return renderProfile(res, req.user, null, [], false, { error_msg: "User not found" });
    }

    const blogs = await Blog.find({ createdBy: req.params.id })
      .populate("createdBy", "fullname profileImageURL")
      .populate("likes", "fullname profileImageURL")
      .sort({ createdAt: -1 });

    const isFollowing = req.user
      ? profileUser.followers.some((follower) => follower._id.equals(req.user._id))
      : false;

    renderProfile(res, req.user, profileUser, blogs, isFollowing, {
      success_msg: req.query.success_msg,
      error_msg: req.query.error_msg,
    });
  } catch (err) {
    console.error("Error loading profile:", err);
    renderProfile(res, req.user, null, [], false, { error_msg: "Failed to load profile" });
  }
});

// POST /profile (update profile)
router.post("/", upload.single("profileImage"), async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/user/signin?error_msg=Please log in to update your profile");
    }

    const { fullname, email, password, bio } = req.body;
    const update = {};

    if (fullname?.trim()) {
      if (fullname.trim().length < 2) {
        return res.redirect("/profile?error_msg=Full name must be at least 2 characters");
      }
      update.fullname = fullname.trim();
    }

    if (email?.trim()) {
      const e = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return res.redirect("/profile?error_msg=Invalid email format");
      }
      const exists = await User.findOne({ email: e, _id: { $ne: req.user._id } });
      if (exists) return res.redirect("/profile?error_msg=Email already in use");
      update.email = e;
    }

    if (password) {
      if (password.length < 6) {
        return res.redirect("/profile?error_msg=Password must be at least 6 characters");
      }
      const salt = randomBytes(16).toString("hex");
      update.salt = salt;
      update.password = createHmac("sha256", salt).update(password).digest("hex");
    }

    if (req.file) {
      if (req.user.profileImageURL && req.user.profileImageURL !== "/images/default.png") {
        try {
          await fs.unlink(path.resolve(`./public${req.user.profileImageURL}`));
        } catch (e) {
          console.warn("Failed to delete old image:", e);
        }
      }
      update.profileImageURL = `/uploads/${req.file.filename}`;
    }

    if (bio?.trim()) {
      update.bio = bio.trim();
    }

    if (!Object.keys(update).length) {
      return res.redirect("/profile?error_msg=No changes provided");
    }

    const updatedUser = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    if (!updatedUser) return res.redirect("/profile?error_msg=User not found");

    const token = createTokenForUser(updatedUser);
    res.cookie("token", token, { httpOnly: true });
    return res.redirect("/profile?success_msg=Profile updated successfully");
  } catch (err) {
    console.error("Error updating profile:", err);
    return res.redirect("/profile?error_msg=Failed to update profile");
  }
});

// DELETE /profile/blog/:id
router.delete("/blog/:id", async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/user/signin?error_msg=Please log in to delete a blog");
    }

    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.redirect("/profile?error_msg=Blog not found");
    if (blog.createdBy.toString() !== req.user._id.toString()) {
      return res.redirect("/profile?error_msg=Unauthorized to delete this blog");
    }

    await Blog.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ blogId: req.params.id });
    await Notification.deleteMany({ blogId: req.params.id });
    return res.redirect("/profile?success_msg=Blog deleted successfully");
  } catch (err) {
    console.error("Error deleting blog:", err);
    return res.redirect("/profile?error_msg=Failed to delete blog");
  }
});

module.exports = router;