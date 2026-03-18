const express = require("express");
const router = express.Router();

// POST /api/admin/auth/validate
// Validate admin password
router.post("/validate", (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const { password } = req.body;
  
  // If no password set in ENV, allow access
  if (!adminPassword) {
    return res.status(200).json({ valid: true });
  }
  
  if (!password) {
    return res.status(400).json({ 
      valid: false,
      message: 'Password required'
    });
  }
  
  if (password === adminPassword) {
    return res.status(200).json({ valid: true });
  } else {
    return res.status(200).json({ 
      valid: false,
      message: 'Invalid password'
    });
  }
});

module.exports = router;