import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "./models/User.js";
import Task from "./models/Task.js";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");

await mongoose.connect(process.env.MONGODB_URI);
const password = await bcrypt.hash("password123", 10);
const admin = await User.findOneAndUpdate(
  { email: "admin@taskflow.demo" },
  { name: "Alex Morgan", email: "admin@taskflow.demo", password, role: "admin" },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
const employee = await User.findOneAndUpdate(
  { email: "jordan@taskflow.demo" },
  { name: "Jordan Lee", email: "jordan@taskflow.demo", password, role: "employee" },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

if ((await Task.countDocuments()) === 0) {
  await Task.insertMany([
    {
      title: "Prepare Q4 campaign brief",
      description: "Gather channel insights and draft the first version of the campaign brief.",
      priority: "high",
      status: "in-progress",
      dueDate: new Date(Date.now() + 2 * 86400000),
      assignedTo: employee._id,
      createdBy: admin._id
    },
    {
      title: "Review customer feedback",
      description: "Summarize the latest customer feedback for the weekly team sync.",
      priority: "medium",
      status: "pending",
      dueDate: new Date(Date.now() + 5 * 86400000),
      assignedTo: employee._id,
      createdBy: admin._id
    },
    {
      title: "Update onboarding checklist",
      description: "Add the new product training steps to the onboarding checklist.",
      priority: "low",
      status: "completed",
      dueDate: new Date(Date.now() - 86400000),
      assignedTo: employee._id,
      createdBy: admin._id
    }
  ]);
}

console.log("Demo accounts ready:");
console.log("  Admin: admin@taskflow.demo / password123");
console.log("  Employee: jordan@taskflow.demo / password123");
await mongoose.disconnect();
