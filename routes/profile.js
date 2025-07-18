const { Router } = require("express");
const fs = require("fs").promises;
const { randomBytes, createHmac } = require("crypto");
const User = require("../models/user");
const Blog = require("../models/blog");
const Comment = require("../models/comments");
const { createTokenForUser } = require("../services/authentication");
const cloudinaryUpload = require("../middlewares/cloudinaryUpload");
const mongoose = require("mongoose");
const { sendEmail } = require("../middlewares/nodemailer");

const router = Router();

// Generate 6-digit code
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Utility: Render Profile with Defaults
const renderProfile = (res, user, profileUser, blogs, isFollowing = false, messages = {}, extra = {}) => {
  return res.render("profile", {
    user: user || null,
    profileUser,
    blogs: blogs || [],
    isFollowing,
    success_msg: messages.success_msg || null,
    error_msg: messages.error_msg || null,
    showPasswordVerification: extra.showPasswordVerification || false,
    newPassword: extra.newPassword || "",
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
    console.log("Profile route hit for ID:", req.params.id);
    if (!mongoose.isValidObjectId(req.params.id)) {
      console.log("Invalid ObjectId:", req.params.id);
      return renderProfile(res, req.user, null, [], false, { error_msg: "Invalid user ID" });
    }

    const profileUser = await User.findById(req.params.id)
      .populate("following", "fullname profileImageURL")
      .populate("followers", "fullname profileImageURL")
      .populate({
        path: "likedBlogs",
        populate: { path: "createdBy", select: "fullname profileImageURL" },
      });

    if (!profileUser) {
      console.log("User not found for ID:", req.params.id);
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
    console.error("Error loading profile for ID:", req.params.id, err);
    renderProfile(res, req.user, null, [], false, { error_msg: "Failed to load profile" });
  }
});

// POST /profile (update profile)
router.post("/", cloudinaryUpload.single("profileImage"), async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/user/signin?error_msg=Please log in to update your profile");
    }

    const { fullname, password, bio } = req.body;
    const update = {};

    if (fullname?.trim()) {
      if (fullname.trim().length < 2) {
        return res.redirect("/profile?error_msg=Full name must be at least 2 characters");
      }
      update.fullname = fullname.trim();
    }

    if (bio?.trim()) {
      update.bio = bio.trim();
    }

    if (req.file) {
      update.profileImageURL = req.file.path; // Cloudinary URL
    }

    if (password) {
      if (password.length < 6) {
        return res.redirect("/profile?error_msg=Password must be at least 6 characters");
      }

      // Generate verification code
      const verificationCode = generateCode();
      const user = await User.findById(req.user._id);
      user.resetPasswordToken = verificationCode;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiry
      await user.save();

      // Send verification email
      const verificationUrl = `http://${req.headers.host}/profile/verify-password`;
      await sendEmail({
        to: user.email,
        subject: "Verify Your Blogify Password Update",
        html: `
          <h2>Blogify Password Update</h2>
          <p>Please enter the following code to verify your password update:</p>
          <h3>${verificationCode}</h3>
          <p>This code expires in 1 hour.</p>
        `,
      });

      // Render profile with verification popup
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

      return renderProfile(res, req.user, profileUser, blogs, false, {
        success_msg: "Verification code sent to your email",
      }, {
        showPasswordVerification: true,
        newPassword: password,
      });
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

// POST /profile/verify-password
router.post("/verify-password", async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/user/signin?error_msg=Please log in to update your password");
    }

    const { code, newPassword } = req.body;
    const user = await User.findById(req.user._id)
      .populate("following", "fullname profileImageURL")
      .populate("followers", "fullname profileImageURL")
      .populate({
        path: "likedBlogs",
        populate: { path: "createdBy", select: "fullname profileImageURL" },
      });

    if (!user) {
      return res.redirect("/profile?error_msg=User not found");
    }

    if (user.resetPasswordToken !== code) {
      const blogs = await Blog.find({ createdBy: req.user._id })
        .populate("createdBy", "fullname profileImageURL")
        .populate("likes", "fullname profileImageURL")
        .sort({ createdAt: -1 });

      return renderProfile(res, req.user, user, blogs, false, {
        error_msg: "Invalid verification code",
      }, {
        showPasswordVerification: true,
        newPassword,
      });
    }

    if (user.resetPasswordExpires < Date.now()) {
      const blogs = await Blog.find({ createdBy: req.user._id })
        .populate("createdBy", "fullname profileImageURL")
        .populate("likes", "fullname profileImageURL")
        .sort({ createdAt: -1 });

      return renderProfile(res, req.user, user, blogs, false, {
        error_msg: "Verification code expired",
      }, {
        showPasswordVerification: true,
        newPassword,
      });
    }

    // Update password
    const salt = randomBytes(16).toString("hex");
    user.salt = salt;
    user.password = createHmac("sha256", salt).update(newPassword).digest("hex");
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    const token = createTokenForUser(user);
    res.cookie("token", token, { httpOnly: true });

    return res.redirect("/profile?success_msg=Password updated successfully");
  } catch (err) {
    console.error("Error verifying password update:", err);
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

    return renderProfile(res, req.user, profileUser, blogs, false, {
      error_msg: "Failed to update password",
    }, {
      showPasswordVerification: true,
      newPassword: req.body.newPassword,
    });
  }
});

module.exports = router;
