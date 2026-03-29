# 🚀 DEPLOYMENT GUIDE - Render.com + UptimeRobot

## 📋 Prerequisites
- GitHub account
- MongoDB Atlas account (free tier)
- Render.com account (free)
- UptimeRobot account (free)

---

## PART 1: PUSH TO GITHUB

### Step 1: Create GitHub Repository
1. Go to https://github.com/new
2. Repository name: `brawl-master-backend` (or any name)
3. Keep it **Private** or **Public** (your choice)
4. **DO NOT** initialize with README (we already have one)
5. Click "Create repository"

### Step 2: Initialize Git (in your local project)
```bash
cd brawl-master-championship
git init
git add .
git commit -m "Initial commit - Backend API"
```

### Step 3: Push to GitHub
```bash
# Replace with YOUR GitHub username and repo name
git remote add origin https://github.com/YOUR_USERNAME/brawl-master-backend.git
git branch -M main
git push -u origin main
```

**DONE!** ✅ Code sekarang di GitHub

---

## PART 2: DEPLOY TO RENDER.COM

### Step 1: Sign Up Render
1. Go to https://render.com
2. Click "Get Started for Free"
3. Sign up dengan **GitHub account** (recommended)
4. Authorize Render to access GitHub

### Step 2: Create New Web Service
1. Click "New +" button (top right)
2. Select "Web Service"
3. Click "Connect a repository"
4. Select `brawl-master-backend` from list
5. Click "Connect"

### Step 3: Configure Service
Fill in the form:

**Name:**
```
brawl-master-api
```
(atau nama lain yang lu mau)

**Region:**
```
Singapore (closest to Indonesia!)
```

**Branch:**
```
main
```

**Root Directory:**
```
(leave blank)
```

**Environment:**
```
Node
```

**Build Command:**
```
npm install
```

**Start Command:**
```
npm start
```

**Instance Type:**
```
Free
```

### Step 4: Add Environment Variables
Scroll down ke "Environment Variables" section.

Click "Add Environment Variable" for each:

**Variable 1:**
```
Key: MONGODB_URI
Value: mongodb+srv://username:password@cluster.mongodb.net/brawl-master?retryWrites=true&w=majority
```
(ganti dengan MongoDB connection string lu!)

**Variable 2:**
```
Key: PORT
Value: 10000
```
(Render uses port 10000 by default)

**Variable 3:**
```
Key: NODE_ENV
Value: production
```

**Variable 4:**
```
Key: ADMIN_PASSWORD
Value: your_secure_password
```
(ganti dengan password admin lu!)

### Step 5: Deploy!
1. Click "Create Web Service" button
2. Wait ~3-5 minutes for deployment
3. Watch the logs (akan muncul realtime)
4. Look for "✅ Build successful" dan "✅ Service live"

### Step 6: Get Your URL
Setelah deploy sukses, lu akan dapat URL:
```
https://brawl-master-api.onrender.com
```

**Test it:**
```
https://brawl-master-api.onrender.com/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-29T...",
  "uptime": 123.456
}
```

**DONE!** ✅ Backend deployed!

---

## PART 3: SETUP UPTIMEROBOT (PREVENT COLD STARTS)

### Why?
Render free tier sleeps after 15 minutes of inactivity.
UptimeRobot will ping your API every 5 minutes to keep it awake!

### Step 1: Sign Up UptimeRobot
1. Go to https://uptimerobot.com
2. Click "Free Sign Up"
3. Create account (email only, no CC needed!)
4. Verify email

### Step 2: Create Monitor
1. Login to UptimeRobot dashboard
2. Click "+ Add New Monitor"

### Step 3: Configure Monitor
Fill in the form:

**Monitor Type:**
```
HTTP(s)
```

**Friendly Name:**
```
Brawl Master API
```

**URL (or IP):**
```
https://brawl-master-api.onrender.com/health
```
(ganti dengan URL Render lu!)

**Monitoring Interval:**
```
Every 5 minutes
```
(free tier allows 5 min minimum)

**Monitor Timeout:**
```
30 seconds
```

**HTTP Method:**
```
GET (HEAD)
```

**Alert Contacts:**
```
(optional - add your email if you want alerts)
```

### Step 4: Create Monitor
1. Click "Create Monitor"
2. Wait a few seconds
3. Monitor should show "Up" status

**DONE!** ✅ API will stay awake 24/7!

---

## PART 4: UPDATE FRONTEND

### Update .env in Frontend
Edit your frontend `.env` file:

**Before:**
```
PUBLIC_API_URL=http://localhost:7239/api
```

**After:**
```
PUBLIC_API_URL=https://brawl-master-api.onrender.com/api
```
(ganti dengan URL Render lu!)

### Redeploy Frontend
If frontend is on Vercel/Netlify:
1. Push changes to GitHub
2. Auto-deploy will trigger
3. Wait ~1 minute
4. Done!

---

## 🎉 VERIFICATION CHECKLIST

Test semua endpoint:

✅ **Health Check:**
```
GET https://brawl-master-api.onrender.com/health
```

✅ **Root:**
```
GET https://brawl-master-api.onrender.com/
```

✅ **API Endpoints:**
```
GET https://brawl-master-api.onrender.com/api/series
GET https://brawl-master-api.onrender.com/api/players
```

✅ **Frontend Connected:**
- Open your frontend app
- Check if data loads
- Try creating game (admin)
- All should work!

---

## 📊 MONITORING

### Render Dashboard
- https://dashboard.render.com
- View logs
- See deployment history
- Check resource usage

### UptimeRobot Dashboard
- https://uptimerobot.com/dashboard
- See uptime percentage (should be 99.9%+)
- View response times
- Get alerts if API goes down

---

## 🔧 TROUBLESHOOTING

### Issue: Deploy Failed
**Check:**
- Build logs in Render
- Make sure all dependencies in package.json
- Check Node version compatibility

**Fix:**
- Add `"engines": { "node": ">=18.0.0" }` to package.json
- Redeploy

### Issue: Can't Connect to MongoDB
**Check:**
- MongoDB Atlas whitelist IP: Allow `0.0.0.0/0` (all IPs)
- Connection string correct in env vars
- Database user has read/write permissions

### Issue: API Sleeps Despite UptimeRobot
**Check:**
- UptimeRobot monitor is "Up" (green)
- Interval is 5 minutes (not longer)
- URL is correct

---

## 💰 COSTS

**Total Monthly Cost:** $0 USD 🎉

- ✅ Render.com: FREE (750 hours = 1 app 24/7)
- ✅ UptimeRobot: FREE (50 monitors)
- ✅ MongoDB Atlas: FREE (512MB storage)

**Upgrade Options (Optional):**
- Render Pro: $7/month (no cold starts, more resources)
- UptimeRobot Pro: $7/month (1 min interval, SMS alerts)

---

## 🎯 DONE!

Your backend is now:
✅ Deployed on Render (free forever!)
✅ Monitored by UptimeRobot (stays awake 24/7)
✅ Connected to MongoDB Atlas
✅ Accessible via HTTPS
✅ Auto-deploys from GitHub

**Enjoy!** 🚀