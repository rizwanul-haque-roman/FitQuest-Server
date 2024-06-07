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

    /**
     * =============================================
     *                GET API
     * =============================================
     */

    // app.get("/trainers", async (req, res) => {
    //   const result = await trainers.find().toArray();
    //   res.send(result);
    // });

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
      console.log(subscriber);
      const result = await subscribers.insertOne(subscriber);
      res.send(result);
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
