import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type User as FirebaseUser } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  getDocs, 
  collection, 
  query, 
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without specifying the firestoreDatabaseId in getFirestore!
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// CRITICAL CONSTRAINT: Validate Firestore connection at bootstrap
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.error("Please check your Firebase configuration or network status.", error);
    } else {
      console.log("Firestore connection check bypassed or succeeded (ignore any permission denied errors on test/connection resource)");
    }
  }
}

// User Profile Service
export async function saveUserProfile(
  userId: string, 
  displayName: string,
  email: string,
  profileData: any,
  registrationDate: string
) {
  const publicPath = `users/${userId}/public/profile`;
  const privatePath = `users/${userId}/private/sensitive`;

  try {
    await setDoc(doc(db, 'users', userId, 'public', 'profile'), {
      displayName: displayName || 'User',
      registrationDate
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, publicPath);
  }

  try {
    const goalsPayload = {
      email,
      issue: profileData.issue || '',
      dietPreference: profileData.preference || '',
      habits: profileData.habits || '',
      isSmoker: profileData.isSmoker || 'no',
      isAlcoholic: profileData.isAlcoholic || 'no',
      phone: profileData.phone || '',
      age: profileData.age || '',
      gender: profileData.gender || '',
      weight: profileData.weight || '',
      height: profileData.height || '',
      activityLevel: profileData.activityLevel || '',
      customCalories: parseInt(profileData.customCalories) || 2000,
      customProtein: parseInt(profileData.customProtein) || 130,
      customCarbs: parseInt(profileData.customCarbs) || 200,
      customFat: parseInt(profileData.customFat) || 60,
      isUsingCustomGoals: profileData.isUsingCustomGoals === true
    };

    await setDoc(doc(db, 'users', userId, 'private', 'sensitive'), goalsPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, privatePath);
  }
}

export async function getUserProfile(userId: string) {
  const privatePath = `users/${userId}/private/sensitive`;
  const publicPath = `users/${userId}/public/profile`;

  let displayName = 'User';
  let registrationDate = new Date().toISOString();

  try {
    const publicSnap = await getDoc(doc(db, 'users', userId, 'public', 'profile'));
    if (publicSnap.exists()) {
      const data = publicSnap.data();
      displayName = data.displayName || 'User';
      registrationDate = data.registrationDate || registrationDate;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, publicPath);
  }

  try {
    const privateSnap = await getDoc(doc(db, 'users', userId, 'private', 'sensitive'));
    if (privateSnap.exists()) {
      const data = privateSnap.data();
      return {
        displayName,
        registrationDate,
        profile: {
          issue: data.issue || '',
          habits: data.habits || '',
          preference: data.dietPreference || '',
          isSmoker: data.isSmoker || 'no',
          isAlcoholic: data.isAlcoholic || 'no',
          phone: data.phone || '',
          age: data.age || '',
          gender: data.gender || '',
          weight: data.weight || '',
          height: data.height || '',
          activityLevel: data.activityLevel || '',
          customCalories: data.customCalories || 2000,
          customProtein: data.customProtein || 130,
          customCarbs: data.customCarbs || 200,
          customFat: data.customFat || 60,
          isUsingCustomGoals: data.isUsingCustomGoals || false
        }
      };
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, privatePath);
  }
}

// Meal Logs Service
export async function saveMealLog(userId: string, meal: any) {
  const path = `users/${userId}/meals/${meal.id}`;
  try {
    const mealPayload = {
      id: meal.id,
      userId,
      timestamp: meal.timestamp instanceof Date ? meal.timestamp.toISOString() : meal.timestamp,
      description: meal.description,
      analysis: meal.analysis
    };
    await setDoc(doc(db, 'users', userId, 'meals', meal.id), mealPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getMealLogs(userId: string) {
  const path = `users/${userId}/meals`;
  try {
    const q = query(collection(db, 'users', userId, 'meals'), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        timestamp: new Date(data.timestamp),
        description: data.description,
        analysis: data.analysis
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// Corrective Tasks Service
export async function saveCorrectiveTaskDoc(userId: string, task: any) {
  const path = `users/${userId}/tasks/${task.id}`;
  try {
    const taskPayload = {
      id: task.id,
      userId,
      title: task.title,
      mealType: task.mealType || 'breakfast',
      isCompleted: task.isCompleted === true,
      createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt
    };
    await setDoc(doc(db, 'users', userId, 'tasks', task.id), taskPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function toggleTaskComplete(userId: string, taskId: string) {
  const path = `users/${userId}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'users', userId, 'tasks', taskId), {
      isCompleted: true
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function getCorrectiveTasks(userId: string) {
  const path = `users/${userId}/tasks`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'tasks'));
    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        title: data.title,
        mealType: data.mealType,
        isCompleted: data.isCompleted,
        createdAt: data.createdAt
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// Diet Plans Service
export async function saveDietPlanDoc(userId: string, plan: any) {
  const path = `users/${userId}/dietPlans/current`;
  try {
    const planPayload = {
      userId,
      title: plan.title,
      weeklySchedule: plan.weeklySchedule,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'users', userId, 'dietPlans', 'current'), planPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getDietPlanDoc(userId: string) {
  const path = `users/${userId}/dietPlans/current`;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'dietPlans', 'current'));
    if (snap.exists()) {
      const data = snap.data();
      return {
        title: data.title,
        weeklySchedule: data.weeklySchedule,
        createdAt: data.createdAt
      };
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}
