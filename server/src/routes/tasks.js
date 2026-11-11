import { Router } from "express";
import mongoose from "mongoose";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const filter = req.user.role === "admin" ? {} : { assignedTo: req.user._id };
    const tasks = await Task.find(filter)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const { title, description = "", priority = "medium", dueDate = null, assignedTo } = req.body;
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "A task title is required." });
    }
    if (!mongoose.isValidObjectId(assignedTo)) {
      return res.status(400).json({ message: "Select a valid employee." });
    }
    if (!["low", "medium", "high"].includes(priority)) {
      return res.status(400).json({ message: "Choose a valid priority." });
    }
    if (description && typeof description !== "string") {
      return res.status(400).json({ message: "Description must be text." });
    }
    if (dueDate && Number.isNaN(Date.parse(dueDate))) {
      return res.status(400).json({ message: "Choose a valid due date." });
    }

    const employee = await User.findOne({ _id: assignedTo, role: "employee" }).select("_id name email");
    if (!employee) return res.status(404).json({ message: "Employee not found." });

    const task = await Task.create({
      title: title.trim(),
      description: description.trim(),
      priority,
      dueDate: dueDate || null,
      assignedTo: employee._id,
      createdBy: req.user._id
    });
    const populatedTask = await task.populate([
      { path: "assignedTo", select: "name email" },
      { path: "createdBy", select: "name" }
    ]);

    req.app.get("io").to(`user:${employee.id}`).emit("task:assigned", {
      task: populatedTask,
      message: `New task assigned: ${populatedTask.title}`
    });
    res.status(201).json({ task: populatedTask });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["pending", "in-progress", "completed"].includes(status)) {
      return res.status(400).json({ message: "Choose a valid task status." });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Task not found." });
    }

    const filter = { _id: req.params.id };
    if (req.user.role !== "admin") filter.assignedTo = req.user._id;
    const task = await Task.findOneAndUpdate(filter, { status }, { new: true, runValidators: true })
      .populate("assignedTo", "name email")
      .populate("createdBy", "name");
    if (!task) return res.status(404).json({ message: "Task not found or you can't update it." });
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Task not found." });
    }

    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found." });

    req.app.get("io").to(`user:${task.assignedTo}`).emit("task:deleted", {
      taskId: task.id,
      message: `Task deleted: ${task.title}`
    });
    res.json({ message: "Task deleted." });
  } catch (error) {
    next(error);
  }
});

export default router;
