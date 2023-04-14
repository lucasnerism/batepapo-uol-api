import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import dayjs from "dayjs";

const app = express();

app.use(express.json());
app.use(cors());
dotenv.config();

const participantSchema = Joi.object({
  name: Joi.string().required(),
  lastStatus: Joi.number()
});

const messageSchema = Joi.object({
  to: Joi.string().required(),
  text: Joi.string().required(),
  type: Joi.string().required()
});

let db;
const mongoClient = new MongoClient(process.env.DATABASE_URL);
try {
  await mongoClient.connect();
  db = mongoClient.db();
} catch (err) {
  console.log(err.message);
}

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const lastStatus = Date.now();
  try {
    const newParticipant = await participantSchema.validateAsync({ name, lastStatus });
    const result = await db.collection("participants").find({ name }).toArray();
    if (result.length !== 0) return res.sendStatus(409);
    await db.collection("participants").insertOne(newParticipant);
    const message = { from: name, to: 'Todos', text: 'entra na sala...', type: 'status', time: dayjs().format("HH:mm:ss") };
    await db.collection("messages").insertOne(message);
    res.sendStatus(201);
  } catch (error) {
    if (error.details) return res.status(422).send(error.details[0].message);
    res.status(500).send(error.message);
  }

});

app.get("/participants", async (req, res) => {
  let participants = [];
  try {
    participants = await db.collection("participants").find().toArray();
  } catch (error) {
    return res.send(error);
  }
  res.send(participants);
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;

  if (type !== "message" && type !== "private_message") return res.sendStatus(422);
  try {
    const result = await db.collection("participants").find({ name: user }).toArray();
    if (result.length === 0) return res.status(422).send("Você não faz parte da sala");
    await Joi.assert(req.body, messageSchema);
    const message = { from: user, to, text, type, time: dayjs().format("HH:mm:ss") };
    await db.collection("messages").insertOne(message);
    res.sendStatus(201);
  } catch (error) {
    console.log(error);
    res.status(422).send(error.details[0].message);
  }
});

app.get("/messages", async (req, res) => {
  let messages = [];
  let { limit } = req.query;
  const { user } = req.headers;

  if (!user) return res.sendStatus(422);
  if (limit !== undefined && (isNaN(Number(limit)) || Number(limit) <= 0)) return res.sendStatus(422);
  try {
    messages = await db.collection("messages").find({ $or: [{ to: user }, { from: user }, { type: { $in: ["message", "status"] } }] }).toArray();
    if (limit !== undefined) {
      return res.send(messages.slice(-Number(limit)));
    }
    res.send(messages);
  } catch (error) {
    console.log(error);
    return res.send(error);
  }
});



const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));