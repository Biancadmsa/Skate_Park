const express = require("express");
const exphbs = require("express-handlebars");
const jwt = require("jsonwebtoken");
const fileUpload = require("express-fileupload");
const bodyParser = require("body-parser");
const path = require("path");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const db = require("./db/db");
const helpers = require("handlebars-helpers")();
require('dotenv').config(); // Cargar variables de entorno

const app = express();

// Configuración del puerto
const port = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, "public", "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configuración de Handlebars
app.engine(
  "hbs",
  exphbs.engine({
    extname: "hbs",
    defaultLayout: false,
    layoutsDir: path.join(__dirname, "views"),
    helpers: helpers,
  })
);
app.set("view engine", "hbs");

// Middleware
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static("public"));
app.use("/static", express.static(path.join(__dirname, "src")));
app.use("/src/css", express.static(path.join(__dirname, "src", "css")));

// Middleware para verificar token
const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).send("Acceso denegado. No se proporcionó token.");
  }
  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).send("Error de autenticación");
  }
};

// Rutas y lógica de tu aplicación
app.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM skaters WHERE is_admin = FALSE AND email!= 'admin@skatepark.com'"
    );
    res.render("home", { skaters: result.rows });
  } catch (error) {
    console.log(error);
    res.status(500).send("Error al cargar los participantes");
  }
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/registrar", (req, res) => {
  res.render("register");
});

app.post("/register", async (req, res) => {
  const {
    nombre,
    email,
    password,
    repeatPassword,
    especialidad,
    anos_experiencia,
  } = req.body;

  const foto = req.files? req.files.foto : null;

  if (password!== repeatPassword) {
    return res.status(400).send("Las contraseñas no coinciden");
  }

  try {
    if (!foto) {
      return res.status(400).send("Debe subir una foto");
    }

    const fileName = Date.now() + "-" + foto.name;
    foto.mv(path.join(uploadsDir, fileName));

    const result = await db.query(
      "INSERT INTO skaters (nombre, email, password, especialidad, anos_experiencia, foto, estado) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
         [nombre, email, password, especialidad, anos_experiencia, fileName, 'revision']
    );

    const token = jwt.sign({ id: result.rows[0].id }, process.env.SECRET_KEY);
    res.cookie("token", token);

    res.render("success");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error al registrar usuario");
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query(
      "SELECT * FROM skaters WHERE email = $1 AND password = $2",
      [email, password]
    );
    if (result.rows.length === 0) {
      return res.status(401).send("Credenciales incorrectas");
    }

    const token = jwt.sign(
      { id: result.rows[0].id, email: result.rows[0].email },
      process.env.SECRET_KEY
    );
    res.cookie("token", token);

    if (email === "admin@skatepark.com") {
      res.redirect("/admin");
    } else {
      res.redirect("/perfil");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error al iniciar sesión");
  }
});

app.get("/admin", verifyToken, async (req, res) => {
  if (req.user.email !== "admin@skatepark.com") {
    return res.status(403).send("Acceso denegado. No eres administrador.");
  }

  try {
    const result = await db.query(
      "SELECT * FROM skaters WHERE email != 'admin@skatepark.com' AND is_admin = FALSE"
    );
    res.render("admin", { participants: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error al cargar la vista de administrador");
  }
});

app.get("/approve/:id", verifyToken, async (req, res) => {
  if (req.user.email !== "admin@skatepark.com") {
    return res.status(403).send("Acceso denegado. No eres administrador.");
  }

  try {
    await db.query("UPDATE skaters SET estado = 'aprobado' WHERE id = $1", [req.params.id]);
    res.redirect("/admin");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error al aprobar participante");
  }
});

app.get("/delete/:id", verifyToken, (req, res) => {
  if (req.user.email !== "admin@skatepark.com") {
    return res.status(403).send("Acceso denegado. No eres administrador.");
  }

  res.render("delete-confirm", { id: req.params.id });
});
app.post("/delete/:id", verifyToken, async (req, res) => {
  if (req.user.email!== "admin@skatepark.com") {
    return res.status(403).send("Acceso denegado. No eres administrador.");
  }

  try {
    await db.query("DELETE FROM skaters WHERE id = $1", [req.params.id]);
    await db.query(
      "SELECT setval(pg_get_serial_sequence('skaters', 'id'), coalesce(max(id), 1), false) FROM skaters"
    );
    res.redirect("/admin"); // Redirigir a la página /admin
  } catch (error) {
    console.error(error);
    res.status(500).send("Error al eliminar usuario");
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});

app.get("/perfil", verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT nombre, email, especialidad, anos_experiencia, foto FROM skaters WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Usuario no encontrado");
    }

    res.render("perfil", { skaters: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error al mostrar el perfil del usuario");
  }
});

app.get("/edit", verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT nombre, email, especialidad, anos_experiencia, foto FROM skaters WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Usuario no encontrado");
    }

    res.render("edit", { skaters: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error al mostrar la vista de edición");
  }
});

app.post("/edit", verifyToken, async (req, res) => {
  const {
    nombre,
    especialidad,
    anos_experiencia,
  } = req.body;

  const foto = req.files? req.files.foto : null;

  try {
    const userEmail = req.user.email; // Get the user's email from the request

    if (foto) {
      const fileName = Date.now() + "-" + foto.name;
      foto.mv(path.join(uploadsDir, fileName));

      await db.query(
        "UPDATE skaters SET nombre = $1, email = $2, especialidad = $3, anos_experiencia = $4, foto = $5 WHERE id = $6",
        [nombre, userEmail, especialidad, anos_experiencia, fileName, req.user.id]
      );
    } else {
      await db.query(
        "UPDATE skaters SET nombre = $1, email = $2, especialidad = $3, anos_experiencia = $4 WHERE id = $5",
        [nombre, userEmail, especialidad, anos_experiencia, req.user.id]
      );
    }

    res.redirect("/");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error al actualizar usuario");
  }
});
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});