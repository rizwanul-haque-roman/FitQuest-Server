const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

/**
 * =======================
 * MONGODB
 * =======================
 */
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uzy5irc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    /**
     * =============================================
     *            DATABASE & COLLECTION
     * =============================================
     */
    const database = client.db("FitQuestDB");
    const classes = database.collection("classes");
    const trainers = database.collection("trainers");
    const testimonials = database.collection("testimonials");
    const forumPosts = database.collection("forumPosts");
    const subscribers = database.collection("subscribers");
    const users = database.collection("users");
    const pricing = database.collection("pricing");
    const payments = database.collection("payments");
    const appliedTrainers = database.collection("appliedTrainers");

    /**
     * =============================================
     *                GET API
     * =============================================
     */

    // ESTIMATED TOTAL TRAINERS
    app.get("/totalTrainers", async (req, res) => {
      const count = await trainers.estimatedDocumentCount();
      res.send({ count });
    });

    // API FOR FETCHING ALL TRAINERS
    app.get("/trainers", async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      const result = await trainers
        .find()
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    // API FOR THE PRICING PLANS
    app.get("/pricing", async (req, res) => {
      const result = await pricing.find().toArray();
      res.send(result);
    });
    // API FOR A SPECIFIC PRICING DATA
    app.get("/pricing/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await pricing.findOne(query);
      res.send(result);
    });

    // API FOR A SPECIFIC TRAINER DATA
    app.get("/trainer/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await trainers.findOne(query);
      res.send(result);
    });

    // ESTIMATED TOTAL POST
    app.get("/totalPosts", async (req, res) => {
      const count = await forumPosts.estimatedDocumentCount();
      res.send({ count });
    });

    // API FOR FETCHING ALL THE POST
    app.get("/posts", async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      const result = await forumPosts
        .find()
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    // API FOR FETCHING TESTIMONIALS
    app.get("/testimonials", async (req, res) => {
      const result = await testimonials.find().toArray();
      res.send(result);
    });

    // API FOR FETCHING 6 RECENT FORUM POSTS
    app.get("/recentPosts", async (req, res) => {
      const recentPosts = await forumPosts
        .find({})
        .sort({ dateTime: -1 })
        .limit(6)
        .toArray();

      res.send(recentPosts);
    });
    // API FOR MOST EXPERIENCED 3 TRAINERS TO DISPLAY IN THE HOMEPAGE
    app.get("/featuredTrainers", async (req, res) => {
      const result = await trainers
        .find()
        .sort({ yearsOfExperience: -1 })
        .limit(3)
        .toArray();
      res.send(result);
    });

    // API FOR FETCHING 6 CLASSES USING $SORT AGGREGATION
    app.get("/featuredClasses", async (req, res) => {
      const pipeline = [{ $sort: { totalBookings: -1 } }, { $limit: 6 }];
      const topClasses = await classes.aggregate(pipeline).toArray();
      const classNames = topClasses.map((c) => c.className);

      const classTrainers = await Promise.all(
        classNames.map(async (className) => {
          const classTrainers = await trainers
            .find(
              { classes: className },
              { projection: { fullName: 1, profileImage: 1 } }
            )
            .limit(5)
            .toArray();
          return { className, trainers: classTrainers };
        })
      );

      const featuredData = topClasses.map((classData) => {
        const trainersForClass = classTrainers.find(
          (c) => c.className === classData.className
        );
        return { ...classData, trainers: trainersForClass.trainers };
      });

      //   console.log(featuredData);
      res.send(featuredData);
    });

    /**
     * =====================
     * POST API
     * =====================
     */

    app.post("/newsletter", async (req, res) => {
      const subscriber = req.body;
      const result = await subscribers.insertOne(subscriber);
      res.send(result);
    });

    app.post("/appliedTrainer", async (req, res) => {
      const applicationData = req.body;
      const result = await appliedTrainers.insertOne(applicationData);
      res.send(result);
    });

    app.post("/payments", async (req, res) => {
      const paymentData = req.body;
      const result = await payments.insertOne(paymentData);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await users.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await users.insertOne(user);
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// ===================
// server test code
// ===================
app.get("/", (req, res) => {
  res.send("HellO MR. SERVER, How have you been?!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
