const { Router } = require("express");
const { randomBytes, createHmac } = require("crypto");
const User = require("../models/user");
const { sendEmail } = require("../middlewares/nodemailer");
const cloudinaryUpload = require("../middlewares/cloudinaryUpload");
const { createTokenForUser } = require("../services/authentication");

const router = Router();

// GET /settings
router.get("/", (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin?error_msg=Please log in to view settings");
  }
  return res.render("settings", {
    user: req.user,
    success_msg: req.query.success_msg,
    error_msg: req.query.error_msg,
  });
});

// POST /settings/update-profile
router.post("/update-profile", cloudinaryUpload.single("profileImage"), async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/user/signin?error_msg=Please log in to update your profile");
    }

    const { fullname, bio } = req.body;
    const update = {};

    if (fullname?.trim()) {
      if (fullname.trim().length < 2) {
        return res.redirect("/settings?error_msg=Username must be at least 2 characters");
      }
      update.fullname = fullname.trim();
    }

    if (bio?.trim()) {
      update.bio = bio.trim();
    }

    if (req.file) {
      update.profileImageURL = req.file.path; // Cloudinary URL
    }

    if (!Object.keys(update).length) {
      return res.redirect("/settings?error_msg=No changes provided");
    }

    const updatedUser = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    if (!updatedUser) return res.redirect("/settings?error_msg=User not found");

    const token = createTokenForUser(updatedUser);
    res.cookie("token", token, { httpOnly: true });
    return res.redirect("/settings?success_msg=Profile updated successfully");
  } catch (err) {
    console.error("Error updating profile:", err);
    return res.redirect("/settings?error_msg=Failed to update profile");
  }
});

// POST /settings/request-password-reset
router.post("/request-password-reset", async (req, res) => {
  try {
    if (!req.user) {
      return res.json({ success: false, error: "Please log in" });
    }

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.json({ success: false, error: "Password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.json({ success: false, error: "User not found" });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = resetCode;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiry
    user.newPassword = createHmac("sha256", user.salt).update(password).digest("hex");
    await user.save();

    await sendEmail({
      to: user.email,
      subject: "Blogify Password Reset Verification",
      html: `
        <h2>Reset Your Blogify Password</h2>
        <p>Please enter the following code to verify your password change:</p>
        <h3>${resetCode}</h3>
        <p>This code expires in 1 hour.</p>
      `,
    });

    return res.json({ success: true, message: "Verification code sent to your email" });
  } catch (error) {
    console.error("Error sending reset code:", error);
    return res.json({ success: false, error: "Failed to send verification code" });
  }
});

// POST /settings/verify-password-reset
router.post("/verify-password-reset", async (req, res) => {
  try {
    const { userId, code, newPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/settings?error_msg=User not found");
    }
    if (user.resetPasswordToken !== code) {
      return res.redirect("/settings?error_msg=Invalid verification code");
    }
    if (user.resetPasswordExpires < Date.now()) {
      return res.redirect("/settings?error_msg=Verification code expired");
    }

    user.password = user.newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.newPassword = undefined;
    await user.save();

    const token = createTokenForUser(user);
    res.cookie("token", token, { httpOnly: true });
    return res.redirect("/settings?success_msg=Password updated successfully");
  } catch (error) {
    console.error("Error verifying reset code:", error);
    return res.redirect("/settings?error_msg=Failed to update password");
  }
});

module.exports = router;
