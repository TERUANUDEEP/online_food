const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = Number(process.env.PORT) || 5001;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log("Middleware executed successfully");
    console.log(`${req.method} ${req.url}`);
    next();
});

app.use(express.static(__dirname));


// ================= MONGODB =================

mongoose.connect("mongodb://localhost:27017/food_delivery")
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ MongoDB Error:", err));


// ================= SCHEMAS =================

const Food = mongoose.model("Food", new mongoose.Schema({
    id: Number,
    name: String,
    price: Number
}));

const Order = mongoose.model("Order", new mongoose.Schema({
    id: Number,
    items: Array,
    total: Number,
    status: String
}));


// ================= INITIAL FOODS =================
// Keeps your existing 5 food items.

async function addInitialFoods() {

    if (await Food.countDocuments() === 0) {

        await Food.insertMany([
            { id: 1, name: "Burger", price: 120 },
            { id: 2, name: "Dosa", price: 80 },
            { id: 3, name: "Fries", price: 90 },
            { id: 4, name: "Pizza", price: 250 },
            { id: 5, name: "Biryani", price: 220 }
        ]);

        console.log("🍔 Initial foods added");
    }
}

mongoose.connection.once("open", addInitialFoods);


// ================= HOME =================

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});


// ================= GET ALL FOODS =================

app.get("/api/foods", async (req, res) => {

    try {
        res.json(await Food.find());
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch foods" });
    }

});


// ================= GET FOOD BY ID =================

app.get("/api/foods/:id", async (req, res) => {

    const food = await Food.findOne({
        id: Number(req.params.id)
    });

    if (!food)
        return res.status(404).json({
            message: "Food item not found"
        });

    res.json(food);
});


// ================= ADD FOOD =================

app.post("/api/foods", async (req, res) => {

    const { name, price } = req.body || {};
    const numericPrice = Number(price);

    if (
        typeof name !== "string" ||
        !name.trim() ||
        !Number.isFinite(numericPrice) ||
        numericPrice <= 0
    ) {
        return res.status(400).json({
            message: "Valid food name and price are required"
        });
    }

    const last = await Food.findOne().sort({ id: -1 });

    const food = await Food.create({
        id: last ? last.id + 1 : 1,
        name: name.trim(),
        price: numericPrice
    });

    res.status(201).json({
        message: "Food item added successfully",
        food
    });
});


// ================= UPDATE FOOD =================

app.put("/api/foods/:id", async (req, res) => {

    const food = await Food.findOne({
        id: Number(req.params.id)
    });

    if (!food)
        return res.status(404).json({
            message: "Food item not found"
        });

    const { name, price } = req.body || {};

    if (name !== undefined) {

        if (typeof name !== "string" || !name.trim())
            return res.status(400).json({
                message: "Food name cannot be empty"
            });

        food.name = name.trim();
    }

    if (price !== undefined) {

        const numericPrice = Number(price);

        if (!Number.isFinite(numericPrice) || numericPrice <= 0)
            return res.status(400).json({
                message: "Price must be greater than 0"
            });

        food.price = numericPrice;
    }

    await food.save();

    res.json({
        message: "Food item updated successfully",
        food
    });
});


// ================= DELETE FOOD =================

app.delete("/api/foods/:id", async (req, res) => {

    const food = await Food.findOneAndDelete({
        id: Number(req.params.id)
    });

    if (!food)
        return res.status(404).json({
            message: "Food item not found"
        });

    res.json({
        message: "Food item deleted successfully",
        food
    });
});


// ================= PLACE ORDER =================

app.post("/api/orders", async (req, res) => {

    const { items } = req.body;

    if (!items || items.length === 0)
        return res.status(400).json({
            message: "Cart is empty"
        });

    let total = 0;
    const orderItems = [];

    for (const item of items) {

        const food = await Food.findOne({
            id: Number(item.id)
        });

        if (food) {

            const quantity = Number(item.quantity) || 1;

            total += food.price * quantity;

            orderItems.push({
                id: food.id,
                name: food.name,
                price: food.price,
                quantity
            });
        }
    }

    if (orderItems.length === 0)
        return res.status(400).json({
            message: "No valid food items in cart"
        });

    const last = await Order.findOne().sort({ id: -1 });

    const order = await Order.create({
        id: last ? last.id + 1 : 1,
        items: orderItems,
        total,
        status: "Placed"
    });

    console.log(`Order ${order.id} placed successfully`);

    res.status(201).json({
        message: "Order placed successfully",
        order
    });
});


// ================= GET ALL ORDERS =================

app.get("/api/orders", async (req, res) => {

    res.json(await Order.find());

});


// ================= GET ORDER BY ID =================

app.get("/api/orders/:id", async (req, res) => {

    const order = await Order.findOne({
        id: Number(req.params.id)
    });

    if (!order)
        return res.status(404).json({
            message: "Order not found"
        });

    res.json(order);
});


// ================= UPDATE ORDER =================

app.put("/api/orders/:id", async (req, res) => {

    const order = await Order.findOne({
        id: Number(req.params.id)
    });

    if (!order)
        return res.status(404).json({
            message: "Order not found"
        });

    if (req.body.status)
        order.status = req.body.status;

    await order.save();

    res.json({
        message: "Order updated successfully",
        order
    });
});


// ================= DELETE ORDER =================

app.delete("/api/orders/:id", async (req, res) => {

    const order = await Order.findOneAndDelete({
        id: Number(req.params.id)
    });

    if (!order)
        return res.status(404).json({
            message: "Order not found"
        });

    res.json({
        message: "Order cancelled successfully",
        order
    });
});


// ================= ERROR HANDLER =================

app.use((err, req, res, next) => {

    console.error(err);

    res.status(500).json({
        message: "Internal Server Error"
    });
});


// ================= START SERVER =================

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});