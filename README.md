# Bloques

Juego HTML5 de una cuadricula 10x10. Los clicks suben el nivel de cada bloque y, cuando un bloque cambia de nivel, el jugador puede reclamarlo con su nombre.

## Como se guarda

GitHub Pages solo publica archivos estaticos: HTML, CSS y JavaScript. No levanta un `npm start` ni un servidor Node permanente.

El juego guarda el estado compartido en Firebase Realtime Database:

```txt
games/main/cells/{cellId}
```

Cada bloque guarda:

```json
{
  "id": "0",
  "clicks": 0,
  "owner": ""
}
```

Si `firebaseConfig` esta incompleto o Firebase falla, el juego muestra un error claro y desactiva la grilla. No hay fallback local.

## Datos iniciales

Hay un archivo listo para importar:

```txt
firebase-initial-data.json
```

Para cargarlo manualmente:

1. Ir a Firebase Console.
2. Entrar a Realtime Database.
3. En la vista de datos, abrir el menu de tres puntos.
4. Elegir Import JSON.
5. Subir `firebase-initial-data.json`.

La app tambien crea automaticamente los 100 bloques si `games/main/cells` esta vacio.

## Configuracion en `app.js`

Editar `firebaseConfig` en `app.js`:

```js
const firebaseConfig = {
  apiKey: "AIzaSyBazRbpQJ3VA8EJhjXJ_M9X1W1OKzygqfw",
  authDomain: "pepeloco-b963b.firebaseapp.com",
  databaseURL: "https://pepeloco-b963b-default-rtdb.firebaseio.com",
  projectId: "pepeloco-b963b",
  storageBucket: "pepeloco-b963b.firebasestorage.app",
  messagingSenderId: "615563200220",
  appId: "1:615563200220:web:34c54414e61a684eac9619",
  measurementId: "G-3HZSWEXN1W"
};
```

Ya esta puesta tu `databaseURL`:

```txt
https://pepeloco-b963b-default-rtdb.firebaseio.com
```

Todavia faltan los valores de tu app web:

- `apiKey`
- `storageBucket`
- `messagingSenderId`
- `appId`

Para obtenerlos:

1. Firebase Console.
2. Project settings.
3. General.
4. Your apps.
5. Si no hay app web, crear una con el icono `</>`.
6. Copiar el objeto `firebaseConfig`.
7. Pegar los valores en `app.js`.

## Reglas simples de Realtime Database

Para probar con amigos, en Realtime Database > Rules:

```json
{
  "rules": {
    "games": {
      "main": {
        "cells": {
          ".read": true,
          "$cellId": {
            ".write": "newData.hasChildren(['id', 'clicks', 'owner']) && newData.child('id').val() == $cellId && newData.child('clicks').isNumber() && newData.child('clicks').val() >= 0 && newData.child('owner').isString() && newData.child('owner').val().length <= 24"
          }
        }
      }
    }
  }
}
```

Son reglas abiertas para jugar/probar. Mas adelante conviene agregar login o App Check.

## Niveles

- 0 clicks: blanco
- 5 clicks: gris
- 15 clicks: naranja
- 35 clicks: amarillo
- 65 clicks: verde
- 105 clicks: azul
- 155 clicks: rojo
- 255 clicks: negro

Cada vez que un bloque cruza uno de esos niveles, pide nombre y cambia de duenio.
