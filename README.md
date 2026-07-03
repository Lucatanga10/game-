# 🎱 8 Ball Pool 3D

Un gioco di biliardo **8 ball pool completamente in 3D**, fatto come webapp: funziona nel browser del telefono e del computer, senza installare nulla.

## ▶️ Come si gioca

Apri `index.html` nel browser. Per l'esperienza migliore servilo con un piccolo server:

```bash
# con Python
python3 -m http.server 8080
# oppure con Node
npx serve
```

poi apri `http://localhost:8080`. Funziona perfettamente anche su **GitHub Pages**.

### Comandi

| Azione | Come |
|---|---|
| Mirare | Trascina un dito sul tavolo |
| Tirare | Trascina in giù lo slider **POTENZA** a destra e rilascia |
| Zoom | Pizzica con due dita |
| Vista dall'alto | Pulsante 🔝 |
| Palla in mano | Trascina la palla bianca dove vuoi |

## ✨ Caratteristiche

- **3D vero** (Three.js) con tavolo verde in panno realistico, sponde, legno, ombre morbide e riflessi sulle palle
- **Regole ufficiali 8-ball**: break, tavolo aperto, assegnazione piene/spezzate, falli (bianca in buca, palla sbagliata, nessuna sponda), palla in mano, vittoria/sconfitta con la 8
- **5 bot** con difficoltà crescente: Scarso 🐢, Medio 🎯, Forte 🔥, Fortissimo 🦈 e **Leggenda ⚡** (ti batte facilmente!)
- **Linee di mira**: traiettoria della bianca, palla fantasma, direzione della palla colpita e deviazione della bianca — più lunghe se tiri più forte
- **Consiglio di mira 💡** sempre attivo (disattivabile): ti evidenzia la palla e la buca migliori
- **Slider di potenza** con percentuale e indicazione (piano / media / forte / FORTISSIMA)
- **Stecche colorate**: classica, nera, rossa, blu, viola, oro
- **Timer di 40 secondi** a turno: se stai fermo, il turno passa al bot
- **Monete e scommesse**: punti da 100 a 2500 🪙, il vincitore prende tutto (con ricarica gratis se resti a secco)
- **Suoni** sintetizzati in tempo reale: colpo di stecca, palle, sponde, buca, vittoria
- **Ottimizzato per il telefono**: 60/120 FPS (segue il refresh dello schermo), touch nativo, layout responsive, fisica a passo fisso indipendente dal framerate

## 🛠 Tecnica

- `game.js` — motore di gioco: fisica 2D su piano (attrito, collisioni elastiche, sponde, buche), rendering 3D, IA dei bot, regole, audio WebAudio
- `vendor/three.min.js` — Three.js r160 incluso in locale (funziona offline)
- Nessuna dipendenza esterna, nessuna build: solo file statici
