
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT) || 5001;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// ================= DATABASE =================

const MONGO_URI =
    process.env.MONGO_URI ||
    "mongodb://localhost:27017/food_delivery";

// ================= SCHEMAS =================

const Food = mongoose.model("Food", new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    price: { type: Number, required: true }
}));

const User = mongoose.model("User", new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    dob: { type: String, required: true },
    gender: { type: String, required: true },
    address: { type: String, required: true, trim: true },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    mobile: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: { type: String, required: true }
}, { timestamps: true }));

const Order = mongoose.model("Order", new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    items: Array,
    total: Number,
    status: String,
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}));

// ================= AUTHENTICATION =================

function createToken(user) {
    return jwt.sign(
        { userId: user._id.toString() },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

function publicUser(user) {
    return {
        id: user._id,
        name: user.name,
        email: user.email
    };
}

function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : "";

    if (!token || !process.env.JWT_SECRET) {
        return res.status(401).json({
            message: "Please register or log in first!"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({
            message: "Session expired. Please log in again."
        });
    }
}

// ================= REGISTER =================

app.post("/api/users/register", async (req, res) => {
    try {
        const { name, dob, gender, address, email, mobile, password } =
            req.body || {};

        const cleanEmail =
            typeof email === "string" ? email.trim().toLowerCase() : "";
        const cleanMobile =
            typeof mobile === "string" ? mobile.trim() : "";

        if (
            typeof name !== "string" || name.trim().length < 3 ||
            !dob ||
            !["Male", "Female", "Other"].includes(gender) ||
            typeof address !== "string" || address.trim().length < 10 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
            !/^[6-9][0-9]{9}$/.test(cleanMobile) ||
            typeof password !== "string" || password.length < 6
        ) {
            return res.status(400).json({
                message: "Please provide valid registration details."
            });
        }

        const existing = await User.findOne({
            $or: [
                { email: cleanEmail },
                { mobile: cleanMobile }
            ]
        });

        if (existing) {
            return res.status(409).json({
                message: "Email or phone number is already registered."
            });
        }

        const user = await User.create({
            name: name.trim(),
            dob,
            gender,
            address: address.trim(),
            email: cleanEmail,
            mobile: cleanMobile,
            password: await bcrypt.hash(password, 12)
        });

        res.status(201).json({
            message: "Registration successful!",
            token: createToken(user),
            user: publicUser(user)
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Email or phone number is already registered."
            });
        }

        console.error(error);
        res.status(500).json({
            message: "Registration failed."
        });
    }
});

// ================= LOGIN =================

app.post("/api/users/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                message: "Email and password are required."
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase()
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        res.json({
            message: "Login successful!",
            token: createToken(user),
            user: publicUser(user)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Login failed." });
    }
});

// ================= CURRENT USER =================

app.get("/api/users/me", requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(401).json({
                message: "User account not found."
            });
        }

        res.json({ user: publicUser(user) });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch user." });
    }
});

// ================= INITIAL FOODS =================

async function addInitialFoods() {
    if (await Food.countDocuments() === 0) {
        await Food.insertMany([
            { id: 1, name: "Burger", price: 120 },
            { id: 2, name: "Dosa", price: 80 },
            { id: 3, name: "Fries", price: 90 },
            { id: 4, name: "Pizza", price: 250 },
            { id: 5, name: "Biryani", price: 220 }
        ]);

        console.log("Initial foods added");
    }
}

// ================= HOME =================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ================= GET FOODS =================

app.get("/api/foods", async (req, res) => {
    try {
        res.json(await Food.find().sort({ id: 1 }));
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch foods." });
    }
});

app.get("/api/foods/:id", async (req, res) => {
    try {
        const food = await Food.findOne({
            id: Number(req.params.id)
        });

        if (!food) {
            return res.status(404).json({
                message: "Food item not found."
            });
        }

        res.json(food);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch food." });
    }
});

// ================= ADD FOOD =================

app.post("/api/foods", async (req, res) => {
    try {
        const { name, price } = req.body || {};
        const numericPrice = Number(price);

        if (
            typeof name !== "string" || !name.trim() ||
            price === "" || price === null || price === undefined ||
            !Number.isFinite(numericPrice) || numericPrice <= 0
        ) {
            return res.status(400).json({
                message: "Valid food name and price are required."
            });
        }

        const last = await Food.findOne().sort({ id: -1 });

        const food = await Food.create({
            id: last ? last.id + 1 : 1,
            name: name.trim(),
            price: numericPrice
        });

        res.status(201).json({
            message: "Food item added successfully.",
            food
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to add food." });
    }
});

// ================= UPDATE FOOD =================

app.put("/api/foods/:id", async (req, res) => {
    try {
        const food = await Food.findOne({
            id: Number(req.params.id)
        });

        if (!food) {
            return res.status(404).json({
                message: "Food item not found."
            });
        }

        const { name, price } = req.body || {};

        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return res.status(400).json({
                    message: "Food name cannot be empty."
                });
            }

            food.name = name.trim();
        }

        if (price !== undefined) {
            const numericPrice = Number(price);

            if (
                price === "" || price === null ||
                !Number.isFinite(numericPrice) || numericPrice <= 0
            ) {
                return res.status(400).json({
                    message: "Price must be greater than 0."
                });
            }

            food.price = numericPrice;
        }

        await food.save();

        res.json({
            message: "Food item updated successfully.",
            food
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to update food." });
    }
});

// ================= DELETE FOOD =================

app.delete("/api/foods/:id", async (req, res) => {
    try {
        const food = await Food.findOneAndDelete({
            id: Number(req.params.id)
        });

        if (!food) {
            return res.status(404).json({
                message: "Food item not found."
            });
        }

        res.json({
            message: "Food item deleted successfully.",
            food
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete food." });
    }
});

// ================= PLACE ORDER =================

app.post("/api/orders", requireAuth, async (req, res) => {
    try {
        const { items } = req.body || {};

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: "Cart is empty." });
        }

        let total = 0;
        const orderItems = [];

        for (const item of items) {
            const food = await Food.findOne({
                id: Number(item.id)
            });

            if (!food) continue;

            const quantity = Number(item.quantity);

            if (!Number.isInteger(quantity) || quantity <= 0) {
                return res.status(400).json({
                    message: "Invalid item quantity."
                });
            }

            total += food.price * quantity;

            orderItems.push({
                id: food.id,
                name: food.name,
                price: food.price,
                quantity
            });
        }

        if (orderItems.length === 0) {
            return res.status(400).json({
                message: "No valid food items in cart."
            });
        }

        const last = await Order.findOne().sort({ id: -1 });

        const order = await Order.create({
            id: last ? last.id + 1 : 1,
            items: orderItems,
            total,
            status: "Placed",
            userId: req.userId
        });

        console.log(`Order ${order.id} placed by user ${req.userId}`);

        res.status(201).json({
            message: "Order placed successfully.",
            order
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to place order." });
    }
});

// ================= GET MY ORDERS =================

app.get("/api/orders", requireAuth, async (req, res) => {
    try {
        const orders = await Order.find({
            userId: req.userId
        }).sort({ id: -1 });

        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch orders." });
    }
});

app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
        const order = await Order.findOne({
            id: Number(req.params.id),
            userId: req.userId
        });

        if (!order) {
            return res.status(404).json({
                message: "Order not found."
            });
        }

        res.json(order);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch order." });
    }
});

// ================= UPDATE MY ORDER =================

app.put("/api/orders/:id", requireAuth, async (req, res) => {
    try {
        const order = await Order.findOne({
            id: Number(req.params.id),
            userId: req.userId
        });

        if (!order) {
            return res.status(404).json({
                message: "Order not found."
            });
        }

        if (req.body.status !== undefined) {
            return res.status(403).json({
                message: "Only authorized staff can change order status."
            });
        }

        res.json({
            message: "Order retrieved successfully.",
            order
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to update order." });
    }
});

// ================= CANCEL MY ORDER =================

app.delete("/api/orders/:id", requireAuth, async (req, res) => {
    try {
        const order = await Order.findOneAndDelete({
            id: Number(req.params.id),
            userId: req.userId
        });

        if (!order) {
            return res.status(404).json({
                message: "Order not found."
            });
        }

        res.json({
            message: "Order cancelled successfully.",
            order
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to cancel order." });
    }
});

// ================= ERROR HANDLER =================

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error." });
});

// ================= START SERVER =================

async function startServer() {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is missing from .env");
        }

        await mongoose.connect(MONGO_URI);
        console.log("MongoDB Connected");

        await addInitialFoods();

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Startup failed:", error.message);
        process.exit(1);
    }
}

startServer();
