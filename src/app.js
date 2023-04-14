import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";

const app = express();

app.use(express.json());
app.use(cors());
dotenv.config();

const participantSchema = Joi.object({
  name: Joi.string().required(),
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
  if (!name) return res.sendStatus(422);

  try {
    await Joi.assert(name, participantSchema);
    const newParticipant = { name: stripHtml(name).result, lastStatus };
    const result = await db.collection("participants").find({ name: stripHtml(name).result }).toArray();
    if (result.length !== 0) return res.sendStatus(409);
    await db.collection("participants").insertOne(newParticipant);
    const message = { from: stripHtml(name).result, to: 'Todos', text: 'entra na sala...', type: 'status', time: dayjs().format("HH:mm:ss") };
    await db.collection("messages").insertOne(message);
  } catch (error) {
    if (error.details) return res.status(422).send(error.details[0].message);
    res.status(500).send(error.message);
  }
  return res.sendStatus(201);
});

app.get("/participants", async (req, res) => {
  let participants = [];
  try {
    participants = await db.collection("participants").find().toArray();
  } catch (error) {
    return res.send(error);
  }
  return res.send(participants);
});

app.post("/messages", async (req, res) => {
  const { to, type, text } = req.body;
  const { user } = req.headers;

  if (!user || !to || !type || !text) return res.sendStatus(422);
  if (type !== "message" && type !== "private_message") return res.sendStatus(422);
  try {
    const result = await db.collection("participants").findOne({ name: user });
    if (!result) return res.status(422).send("Você não faz parte da sala");
    await Joi.assert(req.body, messageSchema);
    const message = { from: stripHtml(user).result, to: stripHtml(to).result, text: stripHtml(text).result, type: stripHtml(type).result, time: dayjs().format("HH:mm:ss") };
    await db.collection("messages").insertOne(message);
  } catch (error) {
    console.log(error);
    res.status(422).send(error.details[0].message);
  }
  return res.sendStatus(201);
});

app.get("/messages", async (req, res) => {
  let messages = [];
  const { limit } = req.query;
  const { user } = req.headers;

  if (!user) return res.sendStatus(422);
  if (limit !== undefined && (isNaN(Number(limit)) || Number(limit) <= 0)) return res.sendStatus(422);
  try {
    messages = await db.collection("messages").find({ $or: [{ to: user }, { from: user }, { type: { $in: ["message", "status"] } }] }).toArray();
    if (limit !== undefined) {
      return res.send(messages.slice(-Number(limit)));
    }
  } catch (error) {
    console.log(error);
    return res.send(error);
  }
  return res.send(messages);
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;
  if (!user) return res.sendStatus(404);
  try {
    const result = await db.collection("participants").find({ name: user }).toArray();
    if (result.length === 0) return res.sendStatus(404);
    const newDate = Date.now();
    await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: newDate } });
  } catch (err) {
    res.sendStatus(500);
  }
  return res.sendStatus(200);
});

app.delete("/messages/:id", async (req, res) => {
  const { id } = req.params;
  const { user } = req.headers;
  if (!user) return res.sendStatus(422);
  try {
    const message = await db.collection("messages").findOne({ _id: new ObjectId(id) });
    if (!message) return res.status(404).send("A mensagem não existe.");
    if (message.from !== stripHtml(user).result) return res.status(401).send("Você não é o dono dessa mensagem!");
    const resultDelete = await db.collection("messages").deleteOne({ _id: new ObjectId(id) });
    if (!resultDelete) return res.status(404).send("A mensagem não existe.");
  } catch (err) {
    console.log(err);
  }
  return res.status(200).send("Mensagem deletada com sucesso!");
});

app.put("/messages/:id", async (req, res) => {
  const { to, type, text } = req.body;
  const { user } = req.headers;
  const { id } = req.params;

  if (!user || !to || !type || !text) return res.sendStatus(422);
  try {
    if (type !== "message" && type !== "private_message") return res.sendStatus(422);
    const result = await db.collection("participants").findOne({ name: stripHtml(user).result });
    if (!result) return res.status(422).send("Você não faz parte da sala");
    const message = await db.collection("messages").findOne({ _id: new ObjectId(id) });
    if (!message) return res.status(404).send("A mensagem não existe!");
    if (message.from !== user) return res.status(401).send("Você não é o dono dessa mensagem!");
    await Joi.assert(req.body, messageSchema);
    const newMessage = { from: stripHtml(user).result, to: stripHtml(to).result, text: stripHtml(text).result, type: stripHtml(type).result, time: dayjs().format("HH:mm:ss") };
    await db.collection("messages").updateOne({ _id: new ObjectId(id) }, { $set: newMessage });
  } catch (error) {
    console.log(error);
    res.status(422).send(error.details[0].message);
  }
  return res.send("Mensagem atualizada com sucesso");
});

const inactiveTime = 15000;
setInterval(async () => {
  try {
    const inactiveDate = Date.now() - 10000;
    const result = await db.collection("participants").find({ lastStatus: { $lt: inactiveDate } }).toArray();
    result.map(async (el) => {
      const message = { from: el.name, to: 'Todos', text: 'sai da sala...', type: 'status', time: dayjs().format("HH:mm:ss") };
      await db.collection("messages").insertOne(message);
    });
    await db.collection("participants").deleteMany({ lastStatus: { $lt: inactiveDate } });

  } catch (err) {
    console.log(err);
  }
}, inactiveTime);

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));