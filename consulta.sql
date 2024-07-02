-- Active: 1713566143574@@127.0.0.1@5432@skatepark

CREATE DATABASE skatepark;

CREATE TABLE skaters (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    anos_experiencia INT NOT NULL,
    especialidad VARCHAR(255) NOT NULL,
    foto VARCHAR(255) NOT NULL,
    estado VARCHAR(255) DEFAULT 'revisión',
    is_admin BOOLEAN DEFAULT FALSE
);

SELECT * FROM skaters;

INSERT INTO skaters (email, nombre, password, anos_experiencia, especialidad, foto, is_admin)
VALUES ('admin@skatepark.com', 'Piero Administrador', 'admin123', 5, 'Jefe Administrativo', 'admin.jpg', TRUE);

