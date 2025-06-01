const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const admin = require("firebase-admin");
const serviceAccount = require("./job-portal-admin-service.json");

const cors = require("cors");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cvlwqch.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFireBaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log("decoded token", decoded);
    req.decoded = decoded;
    next();
  } catch {
    return res.status(401).send({ message: "unauthorized  access" });
  }
};

const verifyEmail = (req, res, next) => {
  if (req.query.email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden access" });
  }
  next()
};

async function run() {
  try {
    // job api
    const jobsCollection = client.db("jobsDB").collection("jobs");
    const applicationsCollection = client
      .db("jobsDB")
      .collection("applications");

    // get all jobs
    app.get("/jobs", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.hr_email = email;
      }
      const cursor = jobsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/jobs/applications", verifyFireBaseToken, verifyEmail, async (req, res) => {
      const email = req.query.email;

      const query = { hr_email: email };
      const jobs = await jobsCollection.find(query).toArray();
      for (const job of jobs) {
        const applicationsQuery = { jobId: job._id.toString() };
        const application_count = await applicationsCollection.countDocuments(
          applicationsQuery
        );
        job.application_count = application_count;
      }
      res.send(jobs);
    });

    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    app.post("/jobs", async (req, res) => {
      const newJob = req.body;
      const result = await jobsCollection.insertOne(newJob);
      res.send(result);
    });

    // apply api
    app.post("/apply", async (req, res) => {
      const application = req.body;
      const result = await applicationsCollection.insertOne(application);
      res.send(result);
    });

    app.get("/applications", async (req, res) => {
      const cursor = applicationsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get(
      "/currentUserApplication",
      verifyFireBaseToken, verifyEmail,
      async (req, res) => {
        const email = req.query.email;

        const query = { email: email };
        const result = await applicationsCollection.find(query).toArray();

        for (const application of result) {
          const jobId = application.jobId;
          const jobQuery = { _id: new ObjectId(jobId) };
          const job = await jobsCollection.findOne(jobQuery);
          application.company = job.company;
          application.title = job.title;
          application.company_logo = job.company_logo;
        }
        res.send(result);
      }
    );

    app.get("/applications/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { jobId: id };
      const cursor = applicationsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/applications/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: req.body.status,
        },
      };
      const result = await applicationsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("job portal server is running now ");
});

app.listen(port, () => {
  console.log(`job portal server is running on port ${port}`);
});
