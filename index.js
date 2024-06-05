const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

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

    /**
     * =============================================
     *                GET API
     * =============================================
     */

    app.get("/classes", async (req, res) => {
      const result = await classes.find().toArray();
      res.send(result);
    });

    app.get("/testimonials", async (req, res) => {
      const result = await testimonials.find().toArray();
      res.send(result);
    });

    // get 6 classes bases on highest total bookings using $sort aggregation

    app.get("/featured", async (req, res) => {
      //   const pipeline = [{ $sort: { totalBookings: -1 } }, { $limit: 6 }];
      //   const result = await classes.aggregate(pipeline).toArray();
      //   res.send(result);
      const pipeline = [{ $sort: { totalBookings: -1 } }, { $limit: 6 }];
      const topClasses = await classes.aggregate(pipeline).toArray();
      const classNames = topClasses.map((c) => c.className);

      const classTrainers = await Promise.all(
        classNames.map(async (className) => {
          const classTrainers = await trainers
            .find(
              { areasOfExpertise: className },
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

      console.log(featuredData);
      res.send(featuredData);
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
