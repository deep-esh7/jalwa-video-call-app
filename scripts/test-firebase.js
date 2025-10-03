const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account-key.json');

console.log('Service Account Key Details:');
console.log('Project ID:', serviceAccount.project_id);
console.log('Client Email:', serviceAccount.client_email);
console.log('Private Key ID:', serviceAccount.private_key_id);

// Initialize Firebase Admin
console.log('\nInitializing Firebase Admin...');
try {
  // First, delete any existing default app
  if (admin.apps.length) {
    admin.app().delete();
  }

  // Initialize with the service account
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log('✅ Firebase Admin initialized successfully!');
  
  // Test authentication
  console.log('\nTesting authentication...');
  const testUid = 'some_test_user_id'; // Replace with a real UID from your Firebase project
  
  admin.auth().getUser(testUid)
    .then((userRecord) => {
      console.log('✅ Successfully fetched user data:');
      console.log('  UID:', userRecord.uid);
      console.log('  Email:', userRecord.email);
      console.log('  Display Name:', userRecord.displayName);
    })
    .catch((error) => {
      console.error('❌ Error fetching user data:', error.message);
      if (error.code === 'auth/user-not-found') {
        console.log('Note: The test user was not found, but Firebase connection is working.');
      }
    });
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  if (error.code === 'app/duplicate-app') {
    console.log('Error: Firebase app already exists. Try restarting your Node.js process.');
  }
}
