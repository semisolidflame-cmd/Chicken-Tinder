# Dinner Swipe (installable web app)

Swipe right/left on nearby restaurants with your partner. Matches carry into the next round until one place is left.

## 1. Google Places key (restaurant lookup)
1. Go to console.cloud.google.com, create a project, and turn on billing (the free monthly credit covers casual use).
2. Enable **Places API (New)**.
3. Create an API key. Under "Application restrictions" choose **Websites** and add your site's address (step 3 below). Under "API restrictions" allow only Places API (New).
4. Paste it into `config.js` as `PLACES_KEY`.

## 2. Firebase (keeps your two phones in sync)
1. console.firebase.google.com: create a project, then **Build > Realtime Database > Create database** (start in locked mode).
2. In **Rules**, paste:
```
{ "rules": { "rooms": { "$room": { ".read": true, ".write": true } } } }
```
   Anyone who knows a room code can join it, so use a code that isn't a common word.
3. Project settings > General > Your apps > add a Web app, then copy `apiKey`, `databaseURL` and `projectId` into `config.js`.

## 3. Host it (must be HTTPS for GPS)
Upload this folder to any static host: Netlify Drop (app.netlify.com/drop), GitHub Pages or Cloudflare Pages. Then add the resulting address to your Google key's website restrictions.

## 4. Install on each phone
- **iPhone:** open the link in Safari > Share > Add to Home Screen.
- **Android:** open in Chrome > menu > Install app.
Allow location when asked.

## Using it
1. Both enter the same room code.
2. Either of you picks categories and a distance, then taps **Find places** (uses that phone's current GPS).
3. Both swipe. The app shows matches, you swipe again, until one is left.
