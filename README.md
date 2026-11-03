# TieSua

![TieSua logo](images/Tiesua-Pill-LightBG-Mode.png)

**Listen. Learn.**

**[Explore the live application](https://tiesua.vercel.app/)**

TieSua is a voice-first, AI-supported mathematics learning application designed for blind and visually impaired Junior High School learners, beginning in Ghana. Its name comes from Twi: **tie** means *listen* and **sua** means *learn*.

Created by **Shadrach Asante** for the **2026 Meta Global AI Developer Hackathon** (*Build for Your World*, Indie Developer track).

## Why TieSua?

Spoken mathematics can hide important structure. Both `(x+2)/4` and `x+(2/4)` might casually be read as “x plus two over four,” even though they mean different things.

TieSua gives mathematical expressions structured spoken readings and supports learners as they explore concepts, ask questions and work through problems by ear.

## What TieSua offers

- **Hear the Difference:** compare mathematical expressions and listen to how their meanings differ.
- **Voice-first interaction:** explore and learn by speech where browser support permits, with typing and explicit controls available as alternatives.
- **Conversational AI tutoring:** Meta's **Muse Spark 1.3 Contributor** helps guide explanations and learner interactions.
- **Independent mathematics checking:** a **SymPy** verifier checks mathematical operations and answers instead of treating AI-generated feedback as proof.
- **Flexible speech settings:** adjust available voices, speaking speed, pauses and volume.
- **Accessible-first design:** clear controls, nonvisual teaching goals and alternate input methods.

### Learning content

The currently available lesson is **Solving Equations with a Fraction**. Other topics in the catalogue are labelled *coming soon*.

## Technology

TieSua uses **React, TypeScript and Vite** on the frontend, with **Python, FastAPI and SymPy** on the backend. The application is hosted on **Vercel**, with Meta Model API integration for AI teaching.

## Run locally

Install Node.js, npm and Python. From the repository root, start the backend and frontend in separate terminals.

**Backend (PowerShell)**

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.venv\Scripts\python.exe -m uvicorn backend.app.main:app --port 8000
```

**Frontend (PowerShell)**

```powershell
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. Live Meta tutoring requires a backend-only `MODEL_API_KEY` or `META_API_KEY`. Never put credentials in frontend environment variables or Git.

## Accessibility and scope

TieSua is being developed with nonvisual learning in mind, but it has **not** yet received formal accessibility certification or completed blind-learner usability validation. Speech recognition and synthesis depend on browser, device and microphone capabilities. A typed input option remains available.

TieSua begins with mathematics, with the longer-term aim of making more learning experiences accessible through listening.

---

*Created by Shadrach Asante · Ghana · 2026*
