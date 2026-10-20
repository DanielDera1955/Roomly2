# Roomly: Firebase setup (do these once)

## 1. Firebase console (project: roomly-4eb3d)
1. Authentication > Settings > User actions: turn OFF "Enable create (sign-up)" so strangers cannot make accounts.
2. Authentication > Users: you already have the admin (chideraugwu75@gmail.com) and a test runner (daniel.f.writes@gmail.com).
3. Firestore Database > Data > Start collection:
   - Collection ID: staff
   - Document ID: daniel.f.writes@gmail.com   (the runner's login email, lowercase)
   - Fields: name (string) = Test Runner, phone (string) = 08000000000, currentZone (string) = Campus Runner, isOnline (boolean) = true
   Repeat for every new runner. For a runner who logs in with a phone number, the email is phone@roomly.app (for example 08012345678@roomly.app).
4. Firestore Database > Rules: delete everything, paste the contents of firestore.rules, click Publish.

## 2. Code
1. Replace/add the files in this folder inside your project (same paths).
2. npm install
3. npm run dev  (test), then push to GitHub and import in Vercel.
4. Firebase console > Authentication > Settings > Authorized domains: add your Vercel domain.
5. Vercel > Project Settings > Node.js Version: choose 24.x if the build complains about Node.

## 3. First admin login
Open yoursite/#admin, sign in with the admin email and password. Open yoursite/#runner for runners.

## Store and food operators
1. Firebase > Authentication > Users > Add user (email, or phone@roomly.app, plus a password).
2. Firestore > staff > Add document. Document ID = that login email in lowercase.
   Fields: name (string), phone (string), role (string) = store   (or food for the food operator).
   Runners have no role field or role = runner.
3. The operator signs in at yoursite/#operator. They only see paid orders (after the student taps
   "I have made payment") and only the items for their own kind.
4. In Admin > Products, set "Sold from" to "Outside: trusted store" or "Outside: food operator".
5. Republish firestore.rules whenever it changes.
