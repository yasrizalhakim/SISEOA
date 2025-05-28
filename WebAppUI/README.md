# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)


XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Firebase Setup Guide for Energy Management System

This guide will walk you through setting up Firebase for the Energy Management System application.

## 1. Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" 
3. Enter a project name (e.g., "Energy Management System")
4. Follow the setup wizard (you can disable Google Analytics if not needed)
5. Click "Create project"

## 2. Set Up Firebase Authentication

1. In the Firebase Console, select your project
2. In the left sidebar, click on "Authentication"
3. Click "Get started"
4. On the "Sign-in method" tab, enable the following authentication methods:
   - Email/Password
   - Anonymous (for device-based login)
5. Save your changes

## 3. Set Up Firebase Realtime Database

1. In the left sidebar, click on "Realtime Database"
2. Click "Create database"
3. Start in test mode (for development)
4. Choose a database location closest to your users
5. Click "Enable"

## 4. Set Up Firestore Database

1. In the left sidebar, click on "Firestore Database"
2. Click "Create database"
3. Start in test mode (for development)
4. Choose a database location closest to your users
5. Click "Enable"

## 5. Register Your Web App

1. On the project overview page, click on the web icon (</>) to add a web app
2. Provide a nickname for your app (e.g., "Energy Management Web")
3. Register the app
4. Firebase will provide you with configuration details that look like this:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com"
};
```

5. Copy these details for the next step

## 6. Configure Your App

1. Open `src/services/firebase.js` in your project
2. Replace the placeholder config with your actual Firebase configuration:

```javascript
// src/services/firebase.js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com"
};
```

## 7. Initialize Sample Data (Development Only)

For development purposes, you can initialize sample device data:

1. Open your browser console
2. Run the following code after your app has loaded:

```javascript
import { initializeSampleData } from './services/firebaseInit';
initializeSampleData();
```

This will create sample devices in your Realtime Database that can be used for testing.

## 8. Install Firebase SDK

Install the Firebase SDK in your project:

```bash
npm install firebase
```

## 9. Set Up Security Rules for Production

Before deploying to production, set up appropriate security rules:

### Firestore Rules

In the Firebase Console, go to Firestore → Rules and set up rules like:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Realtime Database Rules

In the Firebase Console, go to Realtime Database → Rules and set up rules like:

```json
{
  "rules": {
    "devices": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

## 10. Test the Integration

1. Start your application
2. Try to register a new user (use one of the device IDs: DEVICE001, DEVICE002, etc.)
3. Log in with the new user
4. Verify that the dashboard shows device data from the Realtime Database

## Troubleshooting

### Authentication Issues:
- Make sure Email/Password and Anonymous sign-in methods are enabled
- Check browser console for auth errors

### Database Issues:
- Verify your databaseURL is correct in the Firebase config
- Check permissions in the Realtime Database rules
- Make sure you're using the correct path format: `devices/${deviceId}`

### General Issues:
- Check the Firebase Console > Authentication to see if users are being created
- Check the Firebase Console > Realtime Database to see if device data exists
- Verify network requests in the browser's Network tab