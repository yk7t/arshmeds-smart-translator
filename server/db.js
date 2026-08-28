import mongoose from 'mongoose';

export async function connectDB(uri) {
  if (!uri) throw new Error('MONGODB_URI is missing');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB successfully');
}

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
