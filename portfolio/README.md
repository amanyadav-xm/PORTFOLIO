# Aman Yadav – Portfolio (Render)

## Deploy
1. Push this folder to a GitHub repo.
2. Render dashboard → New → Blueprint (uses render.yaml), or New → Web Service:
   Build `npm install`, Start `npm start`.
3. Set environment variable **ADMIN_PASSWORD** (a strong password only you know).
4. For data to survive restarts, add a Disk mounted at `/var/data` and set `DATA_DIR=/var/data`
   (paid plan). Without a disk, edits and uploads are lost on every restart/redeploy.

## Editing (only you)
Open `https://your-site.onrender.com/#admin`, enter the password, then use "Edit site".
Visitors see no edit controls, and the server rejects any save/upload without your login.

## Run locally
    npm install
    ADMIN_PASSWORD=secret npm start     # http://localhost:3000/#admin
