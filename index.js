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
    origin: [
      "http://localhost:5173",
      "https://fitquest-bd.web.app",
      "https://fitquest-bd.firebase.app",
    ],
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
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );

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

    /**
     * =============================================
     *                AUTH RELATED API
     * =============================================
     */

    // JWT
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // VERIFY TOKEN
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // VERIFY ADMIN
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await users.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // VERIFY TRAINER
    const verifyTrainer = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await users.findOne(query);
      const isAdmin = user?.role === "trainer";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    /**
     * =============================================
     *                GET API
     * =============================================
     */

    app.get("/userData", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await users.find(query).toArray();
      res.send(result);
    });

    app.get("/bookedTrainer", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { memberEmail: email };
      const options = {
        sort: { _id: 1 },
        projection: { trainerId: 1 },
        limit: 1,
      };
      const result = await payments.find(query, options).toArray();
      res.send(result);
    });

    // ESTIMATED TOTAL TRAINERS
    app.get("/totalTrainers", async (req, res) => {
      const query = { role: "trainer" };
      const count = await trainers.countDocuments(query);
      res.send({ count });
    });

    // API FOR FETCHING ALL TRAINERS
    app.get("/trainers", async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      const query = { role: "trainer" };
      const result = await trainers
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    // API FOR FETCHING ALL TRAINERS IN DASHBOARD
    app.get(
      "/dashboard/trainers",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const query = { role: "trainer" };
        const result = await trainers
          .find(query, {
            projection: {
              fullName: 1,
              email: 1,
              profileImage: 1,
              _id: 1,
              role: 1,
            },
          })
          .toArray();
        res.send(result);
      }
    );

    // API FOR THE PRICING PLANS
    app.get("/pricing", verifyToken, async (req, res) => {
      const result = await pricing.find().toArray();
      res.send(result);
    });
    // API FOR A SPECIFIC PRICING DATA
    app.get("/pricing/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await pricing.findOne(query);
      res.send(result);
    });

    // API FOR A SPECIFIC TRAINER DATA IN DASHBOARD
    app.get(
      "/trainerDashboard",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
        const email = req.query.email;
        const query = { email: email };
        const result = await trainers.findOne(query);
        res.send(result);
      }
    );

    // API FOR A SPECIFIC TRAINER DATA
    app.get("/trainer/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await trainers.findOne(query);
      res.send(result);
    });

    // ESTIMATED TOTAL CLASSES
    app.get("/totalClasses", async (req, res) => {
      const count = await classes.estimatedDocumentCount();
      res.send({ count });
    });

    // API FOR FETCHING ALL THE classes
    app.get("/classesSearch", async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      const search = req.query.search;
      console.log("Search term:", search);

      // Query to search for classes based on the search term
      const query = { className: { $regex: search, $options: "i" } };

      // Fetch the classes with pagination
      const allClasses = await classes
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();

      // Fetch trainers for each class
      const classNames = allClasses.map((c) => c.className);

      const classTrainers = await Promise.all(
        classNames.map(async (className) => {
          const trainersForClass = await trainers
            .find(
              {
                classes: {
                  $regex: new RegExp(`^${className.split(" ")[0]}`, "i"),
                },
              },
              { projection: { fullName: 1, profileImage: 1, _id: 1 } }
            )
            .limit(5)
            .toArray();
          return { className, trainers: trainersForClass };
        })
      );

      // Combine classes with their respective trainers
      const classesWithTrainers = allClasses.map((classData) => {
        const trainersForClass = classTrainers.find(
          (c) => c.className === classData.className
        );
        return {
          ...classData,
          trainers: trainersForClass ? trainersForClass.trainers : [],
        };
      });

      res.send(classesWithTrainers);

      // console.log(allClasses);
    });
    app.get("/classes", async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      const allClasses = await classes
        .find()
        .skip(page * size)
        .limit(size)
        .toArray();

      const classNames = allClasses.map((c) => c.className);

      const classTrainers = await Promise.all(
        classNames.map(async (className) => {
          const classTrainers = await trainers
            .find(
              // { classes: className },
              {
                classes: {
                  $regex: new RegExp(`^${className.split(" ")[0]}`, "i"),
                },
              },
              { projection: { fullName: 1, profileImage: 1, _id: 1 } }
            )
            .limit(5)
            .toArray();
          return { className, trainers: classTrainers };
        })
      );

      const classesWithTrainers = allClasses.map((classData) => {
        const trainersForClass = classTrainers.find(
          (c) => c.className === classData.className
        );
        return { ...classData, trainers: trainersForClass.trainers };
      });

      res.send(classesWithTrainers);
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

    // API FOR A SINGLE POST DATA
    app.get("/post/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await forumPosts.findOne(query);
      res.send(result);
    });

    // API FOR FETCHING TESTIMONIALS
    app.get("/testimonials", async (req, res) => {
      const result = await testimonials.find().toArray();
      res.send(result);
    });
    // API FOR FETCHING subscribers
    app.get("/subscribers", verifyToken, verifyAdmin, async (req, res) => {
      const result = await subscribers.find().toArray();
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
      const query = { role: "trainer" };
      const result = await trainers
        .find(query)
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
              { projection: { fullName: 1, profileImage: 1, _id: 1 } }
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

    // API FOR FETCHING APPLIED TRAINER DATA ON THE DASHBOARD
    app.get(
      "/appliedTrainersDashboard",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const query = { status: "pending" };
        const result = await trainers
          .find(query, {
            projection: {
              fullName: 1,
              email: 1,
              profileImage: 1,
              _id: 1,
            },
          })
          .toArray();
        res.send(result);
      }
    );

    // API FOR FETCHING APPLIED TRAINER'S DETAILS DATA
    app.get(
      "/appliedTrainers/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await trainers.findOne(query);
        res.send(result);
      }
    );

    // API FOR LATEST 6 PAYMENT
    app.get("/payments", verifyToken, verifyAdmin, async (req, res) => {
      const result = await payments.find().sort({ _id: -1 }).limit(6).toArray();
      res.send(result);
    });

    // API FOR GETTING THE TOTAL BALANCE
    app.get("/totalBalance", verifyToken, verifyAdmin, async (req, res) => {
      const result = await payments
        .aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$price" },
            },
          },
        ])
        .toArray();
      const totalBalance = result.length ? result[0].total : 0;
      res.send({ total: totalBalance });
    });

    // API FOR TOTAL PAID MEMEBERS AND TOTAL SUBS
    app.get("/subMember", async (req, res) => {
      const totalSubscribers = await subscribers.countDocuments();

      const uniquePaidMembersAggregation = await payments
        .aggregate([
          { $group: { _id: "$memberEmail" } },
          { $count: "uniquePaidMembers" },
        ])
        .toArray();

      const uniquePaidMembers =
        uniquePaidMembersAggregation[0]?.uniquePaidMembers || 0;

      res.send({
        totalSubscribers,
        totalPaidMembers: uniquePaidMembers,
      });
    });

    app.get("/bookingData", verifyToken, verifyTrainer, async (req, res) => {
      const name = req.query.name;
      const query = { trainer: name };
      const result = await payments.find(query).toArray();
      res.send(result);
    });

    app.get("/applicationStatus", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const options = {
        projection: { status: 1, feedback: 1 },
      };
      const result = await trainers.find(query, options).toArray();
      res.send(result);
    });

    /**
     * =====================
     * POST API
     * =====================
     */

    app.post("/classes", verifyToken, verifyAdmin, async (req, res) => {
      const classData = req.body;
      const result = await classes.insertOne(classData);
      res.send(result);
    });

    app.post("/testimonials", async (req, res) => {
      const review = req.body;
      const result = await testimonials.insertOne(review);
      res.send(result);
    });

    app.post("/forumPost", verifyToken, async (req, res) => {
      const postData = req.body;
      const result = await forumPosts.insertOne(postData);
      res.send(result);
    });

    app.post("/newsletter", async (req, res) => {
      const subscriber = req.body;
      const result = await subscribers.insertOne(subscriber);
      res.send(result);
    });

    app.post("/appliedTrainer", verifyToken, async (req, res) => {
      const applicationData = req.body;
      const result = await trainers.insertOne(applicationData);
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

    /**
     * =====================
     * PUT & PATCH API
     * =====================
     */
    app.patch("/upvote", async (req, res) => {
      const id = req.query.postId;
      const upvote = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: false };
      const updateUpvote = {
        $set: {
          likes: upvote?.like,
        },
      };
      const result = await forumPosts.updateOne(filter, updateUpvote, options);
      res.send(result);
    });

    app.patch("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: false };
      const userInfo = {
        $set: {
          lastLogin: user?.lastLogin,
        },
      };
      const result = await users.updateOne(filter, userInfo, options);
      res.send(result);
    });

    app.patch("/userUpdate", verifyToken, async (req, res) => {
      const user = req.body;
      const id = user.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: false };
      const userInfo = {
        $set: {
          name: user.name,
          lastLogin: user.lastLogin,
          photoURL: user.profilePicture,
        },
      };
      const result = await users.updateOne(filter, userInfo, options);
      res.send(result);
    });

    // REJECTING THE TRAINER
    app.patch("/rejection", async (req, res) => {
      const applicant = req.body;
      const id = applicant.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const approvedTrainer = {
        $set: {
          role: applicant.role,
          status: applicant.status,
          feedback: applicant.feedback,
        },
      };
      // console.log(approvedTrainer);

      const result = await trainers.updateOne(filter, approvedTrainer, options);
      res.send(result);
    });

    // UPDATING THE TRAINER TO MEMBER
    app.patch("/trainerToMember", async (req, res) => {
      const id = req.query.id;
      const email = req.query.email;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const filter2 = { email: email };
      const options = { upsert: false };
      const updatedTrainer = {
        $set: {
          role: "member",
        },
      };
      const changeUserRole = {
        $set: {
          role: "member",
        },
      };

      const result = await trainers.updateOne(filter, updatedTrainer, options);

      const updateRole = await users.updateOne(
        filter2,
        changeUserRole,
        options
      );
      res.send({ result, updateRole });
    });
    // UPDATING THE PENDING APPLICANT TO TRAINER
    app.patch("/memberToTrainer", async (req, res) => {
      const applicant = req.body;
      const id = applicant.id;
      const email = applicant.email;
      const filter = { _id: new ObjectId(id) };
      const filter2 = { email: email };
      const options = { upsert: false };
      const approvedTrainer = {
        $set: {
          role: applicant.role,
          status: applicant.status,
          classes: applicant.classes,
        },
      };
      const changeUserRole = {
        $set: {
          role: applicant.role,
        },
      };
      // console.log(approvedTrainer);

      const result = await trainers.updateOne(filter, approvedTrainer, options);
      const updateRole = await users.updateOne(
        filter2,
        changeUserRole,
        options
      );
      res.send({ result, updateRole });
    });

    app.patch("/updateSlot", async (req, res) => {
      const updatedData = req.body;
      const email = req.query.email;
      const filter = { email: email };
      const options = { upsert: false };
      const slotAndClass = {
        $set: {
          availableDays: updatedData.days,
          slotsAvailable: updatedData.slotsAvailable,
          classes: updatedData.classes,
        },
      };
      // console.log(slotAndClass);

      const result = await trainers.updateOne(filter, slotAndClass, options);
      res.send(result);
    });
    /**
     * =====================
     * DELETE API
     * =====================
     */

    app.delete("/slotDeletion", async (req, res) => {
      const id = req.query.id;
      const query = { _id: new ObjectId(id) };
      const result = await payments.deleteOne(query);
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
