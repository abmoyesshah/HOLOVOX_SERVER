import { Order } from "../models/Acc&RejOrders.js";
import { Checkout } from "../models/Checkout.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/AsyncHandler.js";
import Stripe from "stripe";

const stripe = new Stripe(
  "sk_test_51Q47vSG124FIRgpMYy2XfP1PthkORGJdpoYLHnLtq8YZsD3YkyckDXIh2cKas6JwxGvHgVU3oFuHfunyaK5qUqtL00cIlfws6N"
);
const CheckoutData = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    message,
    paymentMethod,
    address,
    orderItems,
  } = req.body;
  try {
    if (
      !(
        firstName &&
        lastName &&
        email &&
        phoneNumber &&
        paymentMethod &&
        address
      )
    ) {
      throw new ApiError(400, "All fields are required for placing th order..");
    }
    const checkout = await Checkout.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      message,
      paymentMethod,
      address,
      orderItems,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, checkout, "Order placed Successfully"));
  } catch (error) {
    throw new ApiError(500, "Server error, please try again later");
  }
});
const GetCheckoutData = asyncHandler(async (req, res) => {
  try {
    const getCheckout = await Checkout.find({});
    if (!getCheckout) {
      throw new ApiError(400, "Checkout data not Found");
    }
    return res
      .status(201)
      .json(
        new ApiResponse(
          200,
          getCheckout,
          "Checkout Data retrieve Successfully..."
        )
      );
  } catch (error) {
    throw new ApiError(500, "Server error, please try again later");
  }
});
const DelCheckoutData = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new ApiError(400, "Order ID is required... ...");
    }
    const delCheckout = await Checkout.findByIdAndDelete({ _id: id });
    return res
      .status(201)
      .json(
        new ApiResponse(
          200,
          delCheckout,
          "Checkout data delete Successfully..."
        )
      );
  } catch (error) {
    throw new ApiError(500, error);
  }
});
//Accepted and rejected Order
const OrderTransfer = asyncHandler(async (req, res) => {
  const { status } = req.body; // Accepted/Rejected status
  const { id } = req.params; // ID of the checkout order

  try {
    // Validate ID
    if (!id) {
      return next(new ApiError(400, "Order ID not provided."));
    }

    // Find the order in the Checkout collection
    const findOrder = await Checkout.findById(id);
    if (!findOrder) {
      throw new ApiError(404, "Order not found in Checkout.");
    }

    // Create a new order in the Order collection
    const orderStatus = await Order.create({
      firstName: findOrder.firstName,
      lastName: findOrder.lastName,
      email: findOrder.email,
      phoneNumber: findOrder.phoneNumber,
      paymentMethod: findOrder.paymentMethod,
      address: findOrder.address,
      orderItems: findOrder.orderItems,
      status: status, // Accepted or Rejected
    });

    // Delete the original order from the Checkout collection
    await Checkout.findByIdAndDelete(id);

    // Respond with success
    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          { orderStatus },
          "Order successfully transferred and removed from Checkout."
        )
      );
  } catch (error) {
    // Handle unexpected errors
    throw new ApiError(500, error.message || "Internal Server Error.");
  }
});
const GetTransfer = asyncHandler(async (req, res) => {
  try {
    const getTransfer = await Order.find({});
    if (!getTransfer) {
      throw new ApiError(400, "data not Found");
    }
    return res
      .status(201)
      .json(
        new ApiResponse(
          200,
          getTransfer,
          "Action Data retrieve Successfully..."
        )
      );
  } catch (error) {
    throw new ApiError(500, "Server error, please try again later");
  }
});
const paymentMethod = asyncHandler(async (req, res) => {
  const { products } = req.body;
  // console.log(products);
  const lineItems = products.map((prd) => ({
    price_data: {
      currency: "usd",
      product_data: {
        name: prd.mealName, // Use 'prd' to access the mapped object
      },
      unit_amount: prd.Price, // Convert price to the smallest currency unit
    },
    quantity: prd.count, // Quantity of the product
  }));

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "payment",
    success_url: "https://www.holovox.io/success",
    cancel_url: "https://www.holovox.io/error", 
    // success_url: "http://localhost:5173/success", 
    // cancel_url: "http://localhost:5173/error",
  });

  res.json({ id: session.id, url: session.url, });
});

export {
  CheckoutData,
  GetCheckoutData,
  DelCheckoutData,
  OrderTransfer,
  GetTransfer,
  paymentMethod,
};




