// import mongoose from "mongoose";
// import bcrypt from "bcrypt";
// const ProfileSchema = new mongoose.Schema(
//   {
//     //SignUp Data
//     fullName: {
//       type: String,
//       trim: true,
//     },
//      email: {
//       type: String,
//       unique: true,
//       lowercase: true,
//       trim: true,
//     },
//     password: {
//       type: String,
//       minlength: 6,
//     },
//     role: {
//       type: String,
//       enum: ["user", "admin","doctor","lawyer"],
//       default: "user",
//     },
//     verified:{
//       type: Boolean,
//       default: false
//     },
//     status:{
//       type: String,
//       enum: ["filled","unfilled","none"], 
//       default: "none" // Default to empty string if no image is provided
//     },

//      Specialization : {
//         type: String,
//         enum: ["Orthopedic","Dentist","Pediatrician","Neurologist","Dermatologist","Cardiologist","General Physician","Criminal Law", "Civil Law", "Corporate Law", "Family Law", "Property Law", "Labor and Employment Law", "Tax Law", "Environmental Law", "Human Rights Law", "International Law","Cyber Crime", "Other"],
//         default: "Other"
//     },
//     YearsOfExperience : {
//         type: Number,
//         min: 0,
//     },
//     AvailableDays : {
//         type: [String], // Array of strings to represent available days

//         enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
//     },
//     AvailableTimeSlots : {
//         type: [String], // Array of strings to represent available time slots

//     },
//     Certifications:{
//       type: String
//     },
//     //otpVerification
//     otp: {
//   type: String,
// },
// otpExpiry: {
//   type: Date,
// },
// isOtpVerified: {
//   type: Boolean,
//   default: false
// },
//     // Profile/Personal info
//     ProfilePicture : {
//         type: String, // ⚡ IMPORTANT: string rakho (tumhara meetingId string hai)
//         default : null
//     },
//     Headline : {
//       type : String,
//       default : null
//     },
//     phoneNumber : {
//       type : String,
//       default : null
//     },
//     website : {
//             type : String,
//             default : null
//     },
//     location:{
//       type : String,
//       default : null
//     },
//     languages:{
//     type: [String], // array of strings
//   trim: true,
//     },
// // Profile/Identity
//  FullLegalName:{
//       type: String,
//       trim: true,
//     },
//    Nationality: {
//   type: [String], // array of strings
//   trim: true,
// },
// bio:{
//   type:String,
//   default : null
// },
// // Profile/Call rates
// callRates: [
//   {
//     minutes: {
//       type: Number,
//     },
//     price: {
//       type: Number,
//     }
//   }
// ],
// // Profile/Verification Documents
// Government_issued_ID:{
//   type : String
// },
// Professional_license:{
//   type: String
// },
// Category_Credential:{
// type : String
// }
//   },
//   { timestamps: true }
// );

// export const Profile = mongoose.model("Profile", ProfileSchema);

import mongoose from "mongoose";
const ProfileSchema = new mongoose.Schema(
  {
    //SignUp Data
    fullName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["user", "admin", "doctor", "lawyer"],
      default: "user",
    },
    verified: {
      type: Boolean,
      default: false,
    },
    //otpVerification
    otp: {
      type: String,
    },
    otpExpiry: {
      type: Date,
    },
    isOtpVerified: {
      type: Boolean,
      default: false
    },
    // Profile/Personal info
    ProfilePicture: {
      type: String, // ⚡ IMPORTANT: string rakho (tumhara meetingId string hai)
      default: null
    },
    // Profile/Identity
    DisplayName: {
      type: String,
      trim: true,
    },
    meetingUsed: {
      type: Boolean,
      default: false
    },
    Subscription: {
      type: String,
      enum: ["free", "spark", "assist", "enterprise"],
      default: "free",
    },

  },
  { timestamps: true }
);

// export const Profile = mongoose.model("Profile", ProfileSchema);
const Profile =
  mongoose.models.Profile || mongoose.model("Profile", ProfileSchema);

export default Profile;