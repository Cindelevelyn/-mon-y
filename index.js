const express = require("express");
const expressHandlebars = require("express-handlebars");
const path = require("path");
const bodyParse = require("body-parser");
const { homedir } = require("os");

const PORT = process.env.PORT || 3000;

const app = express(); // Equivalente ao create server

app.engine("handlebars", expressHandlebars.engine());

app.set("view engine", "handlebars");

app.set("views", "./views");

app.use(express.static(path.join(__dirname, "/public"))); //direciona os estaticos sozinho
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.render("home", {
    css: "home.css",
    tituloPagina: "+Mon&y",
    valor: 2200.00,
  });
});

app.listen(PORT, function () {
  console.log(`App de Exemplo escutando na porta ${PORT}`);
});
