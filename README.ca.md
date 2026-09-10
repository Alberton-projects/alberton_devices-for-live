# alberton_devices-for-live

Dispositius Max for Live que van créixer dins d'un set en directe i després es van fer
generals: cap d'ells coneix una pista, un dispositiu ni un plugin pel nom. El que un set ha
de dir a un dispositiu és un paràmetre, una convenció documentada com l'etiqueta `[PITCH]`,
o un receptor posat a la pista. Junts fan un sol instrument, repartit pel set: un panell
que recupera kits sencers per un bus, receptors que el lliguen a pistes i racks, dos
mapejadors de notes, un transpositor quantitzat al compàs, un comandament de joc, un
automatitzador de tempo i una finestra de beat.

| Dispositiu | Tipus | Què fa |
|---|---|---|
| [Kit Selector](devices/kit-selector/) | efecte MIDI | setze strips de programa i volum, nou bancs d'FX, Main; kits en una graella o per program change; emet per un bus |
| [Kit Receiver](devices/kit-receiver/) | efecte MIDI | un per pista: un strip es converteix en program change, chain selector, macro o volum |
| [Kit FX Receiver](devices/kit-fx-receiver/) | efecte d'àudio | un per rack: un banc posa les seves macros; les captura de tornada |
| [Drum Mapper](devices/drum-mapper/) | efecte MIDI | qualsevol nota cap als sons General MIDI d'un tambor: bombo, caixa, hi-hat o plats |
| [Bass Mapper](devices/bass-mapper/) | efecte MIDI | plega qualsevol nota al registre del baix, per octaves |
| [Transpose Q](devices/transpose-q/) | efecte MIDI | transposa tots els dispositius `[PITCH]` al compàs següent, al beat, o a l'instant |
| [Gamepad](devices/gamepad/) | efecte MIDI | un comandament tipus PlayStation mapeja paràmetres, envia notes, dispara clips i escenes |
| [Dummy Tempo Automator](devices/tempo-automator/) | efecte MIDI | un dial que fixa el tempo de Live, perquè ho pugui fer una envolupant de clip |
| [Beat Window](devices/beat-window/) | efecte d'àudio | el beat, gran, en una finestra flotant redimensionable, amb un anell que s'encén a cada beat |

Cada carpeta té el dispositiu, el seu script com a font llegible i un README (en anglès).
Instal·lar és un fitxer per dispositiu: [`docs/INSTALL.md`](docs/INSTALL.md). Com es parlen
els dispositius del kit entre ells, i els altres amb Live: [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

Verificat amb Ableton Live 12.4.3 i Max 9.1.4 a macOS.

## Treballar-hi

```bash
npm test                              # els scripts, sota Node, contra un substitut de Max
python3 tools/check_embedded.py       # cada script incrustat és igual a la seva font
python3 tools/install.py --dev        # dispositius plans, scripts enllaçats, els canvis compilen en viu
python3 tools/install.py --release    # els dispositius incrustats, abans d'un concert
```

Els patchers s'editen com a text (`tools/amxd.py`) o es generen (`tools/build_devices.py`
per als dispositius del kit i el Beat Window), mai no es reserialitzen. `docs/HANDOFF.md`
recull què van fer realment Live i Max pel camí, `docs/SESSION-LOG.md` on és la feina,
`docs/PLAN.md` com es va planificar, i `docs/history/` la revisió que ho va començar tot.

La història és honesta: els dos primers commits guarden els dispositius tal com eren abans
de la revisió de l'agost del 2026 i tal com estaven instal·lats el 2026-09-08; cada canvi
d'aleshores ençà és un commit propi. Els dispositius es van verificar al set d'on venien,
amb l'àudio engegat, a través del projecte germà
[`alberton_mcp-for-live`](https://github.com/Alberton-projects/alberton_mcp-for-live), que
governa Live des d'un LLM.

## Llicència

MIT, © 2026 Albert Burcet. Vegeu [LICENSE](LICENSE).
