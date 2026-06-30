import { Accessories } from "../models/Accessories.model.js";
import { Contact } from "../models/Contact.model.js";
import { Order } from "../models/Order.model.js";
import { Appointment } from "../models/RepairingRequest.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/AsyncHandler.js";

const getDashboardData = asyncHandler(async (req, res) => {

  const [
    totalAppointments,
    totalAccessoriesOrders,
    totalNotifications,
    totalAccessories
  ] = await Promise.all([
    Appointment.countDocuments({}),
    Order.countDocuments({}),
    Contact.countDocuments({}),
    Accessories.countDocuments({})
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalAppointments,
        totalAccessoriesOrders,
        totalNotifications,
        totalAccessories
      },
      "Dashboard data fetched successfully"
    )
  );
});

export { getDashboardData };