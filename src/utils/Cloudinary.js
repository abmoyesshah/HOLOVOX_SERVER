// import { v2 as cloudinary } from "cloudinary";
// import fs from "fs";
// import dotenv from "dotenv";
// dotenv.config();
// cloudinary.config({
//   cloud_name: process.env.CLOUD_NAME,
//   api_key: process.env.API_KEY,
//   api_secret: process.env.API_SECRET,
// });

// // const uploadOnCloudinary = async (localFilePath) => {
// //   try {
// //     const response = await cloudinary.uploader.upload(localFilePath, {
// //       resource_type: "auto",
// //     });
// //     return response.url;
// //   } catch (error) {
// //     fs.unlink(localFilePath);
// //   }
// // };

// // export { uploadOnCloudinary };
// const uploadOnCloudinary = async (localFilePath) => {
//   try {
//     if (!localFilePath) {
//       throw new Error("File path is missing!");
//     }

//     // console.log("Uploading Image to Cloudinary:", localFilePath);

//     const response = await cloudinary.uploader.upload(localFilePath, {
//       resource_type: "auto",
//     });

//     return { url: response.secure_url };
//   } catch (error) {
//     fs.unlink(localFilePath);
//     // console.error("Cloudinary Upload Error:", error.message);

//     return { url: null };
//   }
// };

// export { uploadOnCloudinary };

import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const uploadOnCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { resource_type: "image" },
        (error, result) => {
          if (error) return reject(error);
          resolve({ url: result.secure_url });
        }
      )
      .end(fileBuffer);
  });
};

export { uploadOnCloudinary };
