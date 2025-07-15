const jwt = require("jsonwebtoken");

const secret = "SuperMan@123";

function createTokenForUser(user) {
  const payload = {
    _id: user._id,
    email: user.email,
    profileImageURL: user.profileImageURL,
    role: user.role,
    fullname: user.fullname,
  };
  const token = jwt.sign(payload, secret);
  return token;
}

function validateToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
}

module.exports = {
  createTokenForUser,
  validateToken,
};