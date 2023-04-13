import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";

const app = express();

app.use(express.json());
app.use(cors());
dotenv.config();

const participantSchema = Joi.object({
  name: Joi.string().required(),
  lastStatus: Joi.number()
});

const messageSchema = Joi.object({
  name: Joi.string().required(),
  to: Joi.string().required(),
  text: Joi.string().required(),
  type: Joi.string().required(),
  time: Joi.string().required()
});

let db;
const mongoClient = new MongoClient(process.env.DATABASE_URL);
mongoClient.connect()
  .then(() => db = mongoClient.db())
  .catch((err) => console.log(err.message));

app.post("/participants", (req, res) => {
  const { name } = req.body;
  const lastStatus = Date.now();
  try {
    const newParticipant = participantSchema.validate({ name, lastStatus });
    db.collection("participants").insertOne(newParticipant);
    res.sendStatus(201);
  } catch (error) {
    console.log(error);
    res.send(error);
  }

});


app.get("/participants", async (req, res) => {
  let participants = [];
  try {
    participants = await db.collection("participants").find().toArray();
  } catch (error) {
    console.log(error);
  }
  res.send(participants);
});



const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));