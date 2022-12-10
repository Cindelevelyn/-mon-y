const express = require("express");
const expressHandlebars = require("express-handlebars");
const sessions = require("express-session");
const cookieParser = require("cookie-parser");
const uuidv4 = require("uuid").v4;
const path = require("path");
const db = require("./db");

const mysql = require("mysql2/promise");

const PORT = process.env.PORT || 3000;

const app = express(); // Equivalente ao create server

app.engine("handlebars", expressHandlebars.engine());

app.set("view engine", "handlebars");

app.set("views", "./views");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(
  sessions({
    secret: "thisIsMySecretKey",
    saveUninitialized: true,
    resave: false,
    name: "Cookie de Sessao",
    cookie: { maxAge: 1000 * 60 * 3 }, // 3 minutos
  })
);

app.use("*", async function (req, res, next) {
  if (!req.session.usuario && req.cookies.token) {
    const resultado = await db.query("SELECT * FROM usuarios WHERE token = ?", [
      req.cookies.token,
    ]);
    if (resultado.length) {
      req.session.usuario = resultado[0];
    }
  }
  next();
});

async function getConnection() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "banco_controle4",
  });
  return connection;
}

async function query(sql = "", values = []) {
  const conn = await getConnection();
  const result = await conn.query(sql, values);
  conn.end();

  return result[0];
}

app.get("/", async (req, res) => {
  if (!req.session.usuario) {
    res.redirect("/login");
    return;
  }

  let lista = await query("SELECT * FROM lista");
  let gastos = await query(
    "SELECT COALESCE(SUM(valor),0) FROM lista WHERE entrada = 0"
  );
  let entradas = await query(
    "SELECT COALESCE(SUM(valor),0) FROM lista WHERE entrada = 1"
  );
  if (lista.length > 0) {
    lista = await query("SELECT * FROM lista WHERE id_pessoa = ?", [
      req.session.usuario["usuario_id"],
    ]);
    gastos = await query(
      "SELECT COALESCE(SUM(valor),0) FROM lista WHERE entrada = 0 AND id_pessoa = ?",
      [req.session.usuario["usuario_id"]]
    );
    entradas = await query(
      "SELECT COALESCE(SUM(valor),0) FROM lista WHERE entrada = 1 AND id_pessoa = ?",
      [req.session.usuario["usuario_id"]]
    );
  }

  valorSaida = parseFloat(Object.values(gastos[0]));
  valorEntrada = parseFloat(Object.values(entradas[0]));

  let classe = "";
  let total =
    parseFloat(Object.values(entradas[0])) -
    parseFloat(Object.values(gastos[0]));
  if (total < 0) {
    total = "-R$" + total.toFixed(2) * -1;
    classe = "total";
  } else total = "R$" + total.toFixed(2);

  res.render("home", {
    layout: "admin",
    tituloPagina: "+Mon&y",
    listaTransacoes: lista.reverse(),
    valorSaida: valorSaida.toFixed(2),
    valorEntrada: valorEntrada.toFixed(2),
    classe: classe,
    total: total,
    usuario: req.session.usuario,
  });
});

app.get("/login", async (req, res) => {
  res.render("login", {
    tituloPagina: "+Mon&y",
  });
});

app.get("/cadastro", async (req, res) => {
  res.render("cadastro", {
    tituloPagina: "+Mon&y",
  });
});

app.get("/logout", function (req, res) {
  res.cookie("token", "");
  req.session.destroy();
  res.redirect("/login");
});

app.post("/login", async (req, res) => {
  const { user: usuario, pwd } = req.body;
  const resultado = await db.query(
    "SELECT * FROM usuarios WHERE email = ? AND senha = ?",
    [usuario, pwd]
  );
  console.log(resultado);
  if (resultado.length > 0) {
    req.session.usuario = resultado[0];
    res.redirect("/");
    return;
  }

  dadosPagina = {
    tituloPagina: "+Mon&y | Login",
  };

  res.render("login", {
    tituloPagina: "Login",
    titulo: "Login",
    frase: "Utilize o formulário abaixo para realizar o login na aplicação.",
    mensagemErro: "Usuário/Senha inválidos!",
  });
});

app.post("/cadastro", async (req, res) => {
  const nome = req.body.nome;
  const email = req.body.email;
  const pwd = req.body.pwd;
  let resultado = await db.query("SELECT * FROM usuarios WHERE email = ?", [
    email,
  ]);

  console.log(resultado);
  console.log(resultado.length);

  if (resultado.length > 0) {
    res.render("cadastro", {
      tituloPagina: "Cadastro",
      titulo: "Cadastro",
      frase:
        "Utilize o formulário abaixo acima para realizar o cadastro na aplicação.",
      mensagemErro: "Usuário/Senha já existentes!",
    });
  } else {
    resultado = await db.query(
      "INSERT INTO usuarios(nome, email, senha) VALUES(?, ?, ?)",
      [nome, email, pwd]
    );

    const lista = res.redirect("/");
    return;
  }
});

app.post("/cadastrar", async (req, res) => {
  if (!req.session.usuario) {
    res.redirect("/login");
    return;
  }

  let titulo = req.body.titulo;
  let valor = parseFloat(req.body.valor);
  let categoria = req.body.categoria;
  let entrada = parseInt(req.body.options);
  let data = req.body.data;
  let hora = req.body.hora;

  console.log(entrada);

  dadosPagina = {
    tituloPagina: "+Mon&y",
    mensagem: "",
    titulo,
    valor,
    categoria,
    entrada,
    data,
    hora,
  };

  try {
    if (!titulo) throw new Error("Título é obrigatório!");
    if (!categoria) throw new Error("Categoria é obrigatória!");
    if (entrada != 1 && entrada != 0)
      throw new Error("Tipo de transação é obrigatório!");
    if (!data) throw new Error("Data é obrigatória!");
    if (!hora) throw new Error("Hora é obrigatória!");

    if (valor <= 0) throw new Error("Valor inválido!");

    let sql =
      "INSERT INTO lista(titulo, valor, entrada, categoria, dat, hora, id_pessoa) VALUES(?, ?, ?, ?, ?, ?, ?)";
    let valores = [
      titulo,
      valor,
      entrada,
      categoria,
      data,
      hora,
      req.session.usuario["usuario_id"],
    ];

    await query(sql, valores);
    dadosPagina.mensagem = "Transação cadastrada com sucesso!";
    dadosPagina.cor = "green";
  } catch (error) {
    dadosPagina.mensagem = error.message;
    dadosPagina.cor = "red";
  }

  res.render("cadastrar", dadosPagina);
});

app.get("/edit/:id", async function (req, res) {
  if (!req.session.usuario) {
    res.redirect("/login");
    return;
  }

  const id = parseInt(req.params.id);
  const dados = await query("SELECT * FROM lista WHERE id_li = ?", [id]);
  console.log(dados);

  if (dados.length === 0) {
    res.redirect("/");
    return;
  }
  const objTransacao = dados[0];
  console.log(objTransacao.dat);
  res.render("edit", {
    tituloPagina: "Editar Produto",
    objTransacao,
  });
});

app.post("/edit", async (req, res) => {
  if (!req.session.usuario) {
    res.redirect("/login");
    return;
  }
  let { id, titulo, valor, categoria, options, data, hora } = req.body;

  const dadosPagina = {
    tituloPagina: "Editar Produto",
    mensagem: "",
    objTransacao: {
      titulo: titulo,
      valor: valor,
      categoria: categoria,
      entrada: options,
      dat: data,
      hora: hora,
    },
  };

  try {
    if (!titulo) throw new Error("Título é obrigatório!");
    if (!categoria) throw new Error("Categoria é obrigatória!");
    if (options != 1 && options != 0)
      throw new Error("Tipo de transação é obrigatório!");
    if (!data) throw new Error("Data é obrigatória!");
    if (!hora) throw new Error("Hora é obrigatória!");

    if (valor <= 0) throw new Error("Valor inválido!");

    let sql =
      "UPDATE lista SET titulo = ?, valor = ?, entrada = ?, categoria = ?, dat = ?, hora = ? WHERE id_li = ?";
    let valores = [titulo, valor, options, categoria, data, hora, id];
    // atualiza os dados na base de dados
    await query(sql, valores);
    dadosPagina.mensagem = "Transação atualizada com sucesso!";
    dadosPagina.cor = "green";
  } catch (e) {
    dadosPagina.mensagem = e.message;
    dadosPagina.cor = "red";
  }
  res.render("edit", dadosPagina);
});

app.get("/edit_user/:id", async function (req, res) {
  if (!req.session.usuario) {
    res.redirect("/login");
    return;
  }

  const id = req.session.usuario["usuario_id"];
  const dados = await db.query("SELECT * FROM usuarios WHERE usuario_id = ?", [
    id,
  ]);
  console.log(dados);

  if (dados.length === 0) {
    res.redirect("/");
    return;
  }
  res.render("editar_user", {
    tituloPagina: "Editar Usuario",
    usuario: req.session.usuario,
  });
});

app.post("/edit_user", async (req, res) => {
  if (!req.session.usuario) {
    res.redirect("/login");
    return;
  }

  let { nome, email, senha } = req.body;

  const dadosPagina = {
    tituloPagina: "Editar Produto",
    mensagem: "",
    usuario: req.session.usuario,
  };

  try {
    if (!nome) throw new Error("Nome é obrigatório!");
    if (!email) throw new Error("email é obrigatória!");
    if (!senha) throw new Error("Senha é obrigatória!");

    let sql = await db.query(
      "UPDATE usuarios SET nome = ?, email = ?, senha = ? WHERE usuario_id = ?",
      [nome, email, senha, req.session.usuario["usuario_id"]]
    );
    dadosPagina.mensagem = "Cadastro atualizado com sucesso!";
    dadosPagina.cor = "green";
  } catch (e) {
    dadosPagina.mensagem = e.message;
    dadosPagina.cor = "red";
  }
  res.render("editar_user", dadosPagina);
});

app.get("/sobre", (req, res) => {
  res.render("sobre", {
    tituloPagina: "Sobre",
  });
});

app.get("/cadastrar", (req, res) => {
  if (!req.session.usuario) {
    res.redirect("/login");
    return;
  }
  res.render("cadastrar", {
    tituloPagina: "cadastrar",
  });
});

app.get("/contato", (req, res) => {
  res.render("contato", {
    tituloPagina: "Contato",
  });
});

app.get("/delete/:id", async function (req, res) {
  if (!req.session.usuario) {
    res.redirect("/login");
    return;
  }
  const id = parseInt(req.params.id);
  if (!isNaN(id) && id > 0) {
    await query("DELETE FROM lista WHERE id_li = ?", [id]);
  }
  res.redirect("/");
});

app.get("/", async (req, res) => {
  let busca = req.body.busca;
  let nome = req.params.nome;
  let sql = "SELECT * FROM lista WHERE titulo LIKE ?";
  let valores = ["%" + busca + "%"];
  const produtos = await query(sql, valores);

  dadosPagina = {
    tituloPagina: "Buscar",
    listaTransacoes: produtos.reverse(),
    nomeBuscado: busca,
  };

  res.render("buscar", dadosPagina);
});

app.listen(PORT, function () {
  console.log(`App de Exemplo escutando na porta ${PORT}`);
});
