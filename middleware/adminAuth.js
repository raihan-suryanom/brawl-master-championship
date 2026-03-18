// Middleware to validate admin password for protected routes
const validateAdminPassword = (req, res, next) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  // If no password set in ENV, allow access (backwards compatibility)
  if (!adminPassword) {
    return next();
  }
  
  // Get password from request header
  const providedPassword = req.headers['x-admin-password'];
  
  if (!providedPassword) {
    return res.status(401).json({ 
      message: 'Admin password required',
      error: 'MISSING_PASSWORD'
    });
  }
  
  if (providedPassword !== adminPassword) {
    return res.status(403).json({ 
      message: 'Invalid admin password',
      error: 'INVALID_PASSWORD'
    });
  }
  
  // Password valid, proceed
  next();
};

module.exports = { validateAdminPassword };