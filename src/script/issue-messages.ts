import type { TranslatableText } from "../campaign/campaign-text.ts";

/**
 * Ready-check message templates of the map script validator (trigger design §11.1), one per issue code, in the
 * shared issue table pattern of `campaign-issues.ts`. `{path}` and the issue params fill the placeholders.
 */
export const SCRIPT_ISSUE_MESSAGES = {
  actorVariableNotEmpty: {
    en: "{path}: an actor variable always starts empty; actions fill it at run time.",
    hu: "{path}: a szereplő-változó mindig üresen indul; futás közben a műveletek töltik fel.",
    de: "{path}: Eine Akteur-Variable ist zu Beginn immer leer; Aktionen füllen sie zur Laufzeit."
  },
  archipelagoActionNotAllowed: {
    en: "{path}: quest {questId} runs in the archipelago executor, which supports only colonyEnd and notify ({op}).",
    hu: "{path}: a(z) {questId} küldetés a szigetvilág-végrehajtóban fut, amely csak a colonyEnd és notify " +
      "műveletet ismeri ({op}).",
    de: "{path}: Quest {questId} läuft in der Archipel-Ausführung, die nur colonyEnd und notify unterstützt " +
      "({op})."
  },
  aboveShipCapacity: {
    en: "{path}: {count} {load} do not fit on {ship} (deck capacity {capacity}).",
    hu: "{path}: {count} {load} nem fér el a(z) {ship} hajón (fedélzeti kapacitás: {capacity}).",
    de: "{path}: {count} {load} passen nicht auf {ship} (Deckkapazität {capacity})."
  },
  arrayTooLong: {
    en: "{path}: an array holds at most {limit} items.",
    hu: "{path}: egy tömb legfeljebb {limit} elemet tartalmazhat.",
    de: "{path}: Ein Array enthält höchstens {limit} Einträge."
  },
  audioKindMismatch: {
    en: "{path}: {id} is a {actual}, but this slot needs a {expected}.",
    hu: "{path}: a(z) {id} típusa {actual}, de ez a hely {expected} típust vár.",
    de: "{path}: {id} hat den Typ {actual}, aber dieser Slot erwartet den Typ {expected}."
  },
  audioOptionOutOfRange: {
    en: "{path}: {option} must be between {min} and {max}.",
    hu: "{path}: a(z) {option} értéknek {min} és {max} között kell lennie.",
    de: "{path}: {option} muss zwischen {min} und {max} liegen."
  },
  bareStringReference: {
    en: "{path}: expected a {expected} reference, found a bare text value.",
    hu: "{path}: {expected} hivatkozás kell, de puszta szöveg szerepel.",
    de: "{path}: Erwartet wurde eine {expected}-Referenz, gefunden wurde ein reiner Textwert."
  },
  capabilityMissing: {
    en: "{path}: no catalog entry of {selector} can do \"{capability}\".",
    hu: "{path}: a(z) {selector} egyik katalógusbejegyzése sem képes erre: „{capability}”.",
    de: "{path}: Kein Katalogeintrag von {selector} kann „{capability}“ ausführen."
  },
  colonyHoldDeadlineLocked: {
    en: "{path}: the colony.hold deadline is the colony lifetime (14 days) and cannot be changed yet.",
    hu: "{path}: a colony.hold határideje a kolónia élettartama (14 nap), és egyelőre nem módosítható.",
    de: "{path}: Die Frist von colony.hold ist die Lebensdauer der Kolonie (14 Tage) und kann noch nicht " +
      "geändert werden."
  },
  commanderWithoutLodge: {
    en: "{path}: a commander actor needs a Commander's Lodge on the map.",
    hu: "{path}: a parancsnok szereplőhöz parancsnoki szállás kell a pályán.",
    de: "{path}: Ein Kommandanten-Akteur benötigt eine Kommandantenhütte auf der Karte."
  },
  contentKindNotAllowed: {
    en: "{path}: {id} is not one of the allowed kinds ({kinds}).",
    hu: "{path}: a(z) {id} nem a megengedett fajták egyike ({kinds}).",
    de: "{path}: {id} ist keine der erlaubten Arten ({kinds})."
  },
  duplicateId: { en: "{path}: the id {id} is used more than once.",
    hu: "{path}: a(z) {id} azonosító többször szerepel.",
    de: "{path}: Die ID {id} wird mehr als einmal verwendet." },
  duplicateStepId: {
    en: "{path}: the step id {id} is used more than once in this list.",
    hu: "{path}: a(z) {id} lépésazonosító többször szerepel ebben a listában.",
    de: "{path}: Die Schritt-ID {id} wird in dieser Liste mehr als einmal verwendet."
  },
  duplicateVariableName: {
    en: "{path}: another variable is already called {name}.",
    hu: "{path}: már van {name} nevű változó.",
    de: "{path}: Eine andere Variable heißt bereits {name}."
  },
  endMapExitOffCampaign: {
    en: "{path}: only a campaign map has exits; remove the exit (this is a {mapKind} map).",
    hu: "{path}: csak hadjárati pályának vannak kijáratai; töröld a kijáratot (ez {mapKind} pálya).",
    de: "{path}: Nur eine Kampagnenkarte hat Ausgänge; entfernen Sie den Ausgang " +
      "(dies ist eine Karte vom Typ {mapKind})."
  },
  endMapExitOnDefeat: {
    en: "{path}: a defeat has no exit; remove the exit or end the map with victory.",
    hu: "{path}: a vereségnek nincs kijárata; töröld a kijáratot, vagy fejezd be a pályát győzelemmel.",
    de: "{path}: Eine Niederlage hat keinen Ausgang; entfernen Sie den Ausgang oder beenden Sie die " +
      "Karte mit einem Sieg."
  },
  endMapUnknownExit: {
    en: "{path}: the map declares no exit {exit}.",
    hu: "{path}: a pálya nem jelent be ilyen kijáratot: {exit}.",
    de: "{path}: Die Karte deklariert keinen Ausgang {exit}."
  },
  // EAI2c faction AI actions: hu/de pending (translation card), English stands in.
  factionAiDevelopWithoutSettlers: {
    en: "{path}: the develop mode needs start settlers in the faction's AI entry of the map rules.",
    hu: "{path}: the develop mode needs start settlers in the faction's AI entry of the map rules.",
    de: "{path}: the develop mode needs start settlers in the faction's AI entry of the map rules."
  },
  factionAiPeopleAboveTarget: {
    en: "{path}: with this mode the computer factions' people limits and the player's start add up to " +
      "{people}; one island is planned for {target} people.",
    hu: "{path}: with this mode the computer factions' people limits and the player's start add up to " +
      "{people}; one island is planned for {target} people.",
    de: "{path}: with this mode the computer factions' people limits and the player's start add up to " +
      "{people}; one island is planned for {target} people."
  },
  factionAiSecondDevelop: {
    en: "{path}: a map may have {max} computer faction in the develop mode; another faction already " +
      "develops or is switched to it.",
    hu: "{path}: a map may have {max} computer faction in the develop mode; another faction already " +
      "develops or is switched to it.",
    de: "{path}: a map may have {max} computer faction in the develop mode; another faction already " +
      "develops or is switched to it."
  },
  factionAiStyleWithoutDevelop: {
    en: "{path}: a style applies to the develop mode only.",
    hu: "{path}: a style applies to the develop mode only.",
    de: "{path}: a style applies to the develop mode only."
  },
  // EAI4c: hu/de pending (translation card), English stands in.
  factionGoalSecondsNotPositive: {
    en: "{path}: the goal's duration must be more than 0 seconds; leave it empty for a goal that stays.",
    hu: "{path}: the goal's duration must be more than 0 seconds; leave it empty for a goal that stays.",
    de: "{path}: the goal's duration must be more than 0 seconds; leave it empty for a goal that stays."
  },
  factionWithoutAi: {
    en: "{path}: pick one computer faction that has units, buildings or an AI entry on the map.",
    hu: "{path}: pick one computer faction that has units, buildings or an AI entry on the map.",
    de: "{path}: pick one computer faction that has units, buildings or an AI entry on the map."
  },
  fireLimitedTrigger: {
    en: "{path}: trigger {name} was switched off by the fire limit in the last play-test.",
    hu: "{path}: a(z) {name} eseményindítót a legutóbbi próbajátékban kikapcsolta a gyakorisági korlát.",
    de: "{path}: Auslöser {name} wurde im letzten Testspiel durch das Auslöselimit deaktiviert."
  },
  forEachMaxAboveCap: {
    en: "{path}: a loop may visit at most {cap} members ({max} given).",
    hu: "{path}: egy ciklus legfeljebb {cap} tagot járhat be ({max} van megadva).",
    de: "{path}: Eine Schleife kann höchstens {cap} Elemente durchlaufen ({max} angegeben)."
  },
  highlightWaitNeedsClicked: {
    en: "{path}: only a highlight that lasts until it is clicked can be waited on.",
    hu: "{path}: csak a kattintásig tartó kiemelésre lehet várni.",
    de: "{path}: Es kann nur auf eine Hervorhebung gewartet werden, die bis zum Klick bestehen bleibt."
  },
  homeRewardBeforeCompletionProof: {
    en: "{path}: {item} pays home rewards per completion; the server pays them only after the completion proof " +
      "(TRG7b), until then the claims stay pending.",
    hu: "{path}: a(z) {item} teljesítésenként ad otthoni jutalmat; a szerver csak a teljesítési igazolás (TRG7b) " +
      "után fizeti ki, addig a jóváírás függőben marad.",
    de: "{path}: {item} zahlt pro Abschluss eine Heimatbelohnung; der Server zahlt sie erst nach dem " +
      "Abschlussnachweis (TRG7b) aus, bis dahin bleiben die Ansprüche offen."
  },
  instanceRequired: {
    en: "{path}: this slot needs an authored actor or an actor variable.",
    hu: "{path}: ide megnevezett szereplő vagy szereplő-változó kell.",
    de: "{path}: Dieser Slot erfordert einen benannten Akteur oder eine Akteur-Variable."
  },
  invalidReward: { en: "{path}: {detail}", hu: "{path}: érvénytelen jutalom ({detail}).",
    de: "{path}: Ungültige Belohnung ({detail})." },
  invalidShape: { en: "{path}: invalid value ({detail}).", hu: "{path}: érvénytelen érték ({detail}).",
    de: "{path}: Ungültiger Wert ({detail})." },
  invalidTranslationKey: {
    en: "{path}: {key} is not a translation key.",
    hu: "{path}: a(z) {key} nem fordítási kulcs.",
    de: "{path}: {key} ist kein Übersetzungsschlüssel."
  },
  invalidVariableName: {
    en: "{path}: {name} is not a valid variable name (a letter, then letters, digits or _).",
    hu: "{path}: a(z) {name} nem érvényes változónév (betű, majd betűk, számjegyek vagy _).",
    de: "{path}: {name} ist kein gültiger Variablenname (ein Buchstabe, danach Buchstaben, Ziffern oder _)."
  },
  missingEnglishText: {
    en: "{path} has no English text (the fallback language).",
    hu: "{path} angol szövege hiányzik (ez a tartalék nyelv).",
    de: "{path}: Der englische Text fehlt (die Ausweichsprache)."
  },
  missingSlot: { en: "{path}: {slot} must be set.", hu: "{path}: a(z) {slot} mezőt meg kell adni.",
    de: "{path}: {slot} muss angegeben werden." },
  missingTranslation: { en: "{path} has no {language} translation.", hu: "{path} {language} fordítása hiányzik.",
    de: "{path}: Die Übersetzung für {language} fehlt." },
  multiboardColumnWithoutCell: {
    en: "{path}: column {column} has no cell expression.",
    hu: "{path}: a(z) {column} oszlopnak nincs cellakifejezése.",
    de: "{path}: Spalte {column} hat keinen Zellausdruck."
  },
  multiboardRowSourceNotArray: {
    en: "{path}: rows per array element need an array variable.",
    hu: "{path}: a tömbelemenkénti sorokhoz tömb típusú változó kell.",
    de: "{path}: Zeilen pro Array-Element benötigen eine Array-Variable."
  },
  multiboardCellRandom: {
    en: "{path}: a board cell cannot use random (cells are evaluated for display and would change the game).",
    hu: "{path}: egy táblacella nem használhat véletlent (a cella csak megjelenítés, a játékot változtatná).",
    de: "{path}: Eine Tafelzelle darf keinen Zufall verwenden (Zellen dienen nur der Anzeige und würden das Spiel " +
      "verändern)."
  },
  multiboardUnknownColumn: {
    en: "{path}: {column} is not a column of this board.",
    hu: "{path}: a(z) {column} nem oszlopa ennek a táblának.",
    de: "{path}: {column} ist keine Spalte dieses Multiboards."
  },
  nestingTooDeep: {
    en: "{path}: nested deeper than {limit} levels.",
    hu: "{path}: {limit} szintnél mélyebb egymásba ágyazás.",
    de: "{path}: Tiefer als {limit} Ebenen verschachtelt."
  },
  notOnMapKind: {
    en: "{path}: {kind} is not available on a {mapKind} map.",
    hu: "{path}: a(z) {kind} nem használható {mapKind} típusú pályán.",
    de: "{path}: {kind} ist auf einer Karte vom Typ {mapKind} nicht verfügbar."
  },
  notServerProvable: {
    en: "{path}: this reward depends only on what the player's device reports; the server cannot prove it.",
    hu: "{path}: ez a jutalom csak a játékos eszközének jelentésén múlik; a szerver nem tudja igazolni.",
    de: "{path}: Diese Belohnung hängt nur davon ab, was das Gerät des Spielers meldet; der Server kann sie " +
      "nicht nachweisen."
  },
  notYetAvailable: {
    en: "{path}: {kind} is validated but does not run until lane {lane} lands.",
    hu: "{path}: a(z) {kind} ellenőrizve van, de csak a(z) {lane} sáv után működik.",
    de: "{path}: {kind} wird geprüft, läuft aber erst, wenn Lane {lane} verfügbar ist."
  },
  ownerFilterConflict: {
    en: "{path}: the event's player filter already sets the owner of this subject; remove the owner here.",
    hu: "{path}: az esemény játékosszűrője már megadja ennek az alanynak a tulajdonosát; itt töröld.",
    de: "{path}: Der Spielerfilter des Ereignisses legt bereits den Besitzer dieses Subjekts fest; " +
      "entfernen Sie den Besitzer hier."
  },
  ownerRequired: {
    en: "{path}: choose whose objects count (an owner filter).",
    hu: "{path}: add meg, kinek az objektumai számítanak (tulajdonosszűrő).",
    de: "{path}: Wählen Sie aus, wessen Objekte zählen (ein Besitzerfilter)."
  },
  parallelSpawn: {
    en: "{path}: trigger {name} runs in parallel and spawns; several runs can spawn at once.",
    hu: "{path}: a(z) {name} eseményindító párhuzamosan fut és létrehoz; több futás egyszerre is létrehozhat.",
    de: "{path}: Auslöser {name} läuft parallel und erzeugt Objekte; mehrere Läufe können gleichzeitig " +
      "Objekte erzeugen."
  },
  phrasingSlotMissing: {
    en: "{path}: the inverse wording of {kind} needs {slot} to be chosen.",
    hu: "{path}: a(z) {kind} fordított megfogalmazásához ki kell választani ezt: {slot}.",
    de: "{path}: Die umgekehrte Formulierung von {kind} erfordert die Auswahl von {slot}."
  },
  placedObjectChanged: {
    en: "{path}: map object #{objectId} of actor {actor} is now {found}, not {expected}.",
    hu: "{path}: a(z) {actor} szereplő #{objectId} térképobjektuma most {found}, nem {expected}.",
    de: "{path}: Kartenobjekt #{objectId} von Akteur {actor} ist jetzt {found}, nicht {expected}."
  },
  placedObjectMissing: {
    en: "{path}: actor {actor} binds map object #{objectId}, which the map no longer has.",
    hu: "{path}: a(z) {actor} szereplő a #{objectId} térképobjektumhoz kötött, de a térképen már nincs ilyen.",
    de: "{path}: Akteur {actor} ist an Kartenobjekt #{objectId} gebunden, das die Karte nicht mehr enthält."
  },
  placedObjectMoved: {
    en: "{path}: map object #{objectId} of actor {actor} moved from cell {expected} to {found}; check the binding.",
    hu: "{path}: a(z) {actor} szereplő #{objectId} térképobjektuma a(z) {expected} cellából a(z) {found} cellába " +
      "került; ellenőrizze a kötést.",
    de: "{path}: Kartenobjekt #{objectId} von Akteur {actor} wurde von Zelle {expected} nach {found} " +
      "verschoben; prüfen Sie die Bindung."
  },
  qualifierNotDeclared: {
    en: "{path}: {id} has no {axis} {value} (not a declared variant).",
    hu: "{path}: a(z) {id} nem ismeri ezt: {axis} {value} (nem bejelentett változat).",
    de: "{path}: {id} hat keinen Wert {value} für {axis} (keine deklarierte Variante)."
  },
  questPrerequisiteCycle: {
    en: "{path}: quest {questId} can never start: its prerequisites form a cycle.",
    hu: "{path}: a(z) {questId} küldetés sosem indulhat: az előfeltételei kört alkotnak.",
    de: "{path}: Quest {questId} kann nie starten: Ihre Voraussetzungen bilden einen Zyklus."
  },
  rawStringInVisibleSlot: {
    en: "{path}: players see this text, so it must be a translatable text, not a plain string.",
    hu: "{path}: ezt a szöveget a játékos látja, ezért fordítható szöveg kell, nem egyszerű karakterlánc.",
    de: "{path}: Spieler sehen diesen Text, daher muss er ein übersetzbarer Text sein, kein einfacher String."
  },
  refTypeMismatch: {
    en: "{path}: {id} is a {actual} variable, not a {expected}.",
    hu: "{path}: a(z) {id} {actual} típusú változó, nem {expected}.",
    de: "{path}: {id} ist eine Variable des Typs {actual}, nicht des Typs {expected}."
  },
  retiredContent: {
    en: "{path}: {id} was retired from the content catalog.",
    hu: "{path}: a(z) {id} ki lett vezetve a tartalomkatalógusból.",
    de: "{path}: {id} wurde aus dem Inhaltskatalog entfernt."
  },
  runTriggerCycle: {
    en: "{path}: trigger {trigger} calls itself again without a wait in between.",
    hu: "{path}: a(z) {trigger} eseményindító várakozás nélkül újra önmagát hívja.",
    de: "{path}: Auslöser {trigger} ruft sich ohne Wartezeit erneut selbst auf."
  },
  scriptTooDeep: {
    en: "The script is nested deeper than {limit} levels or holds non-data values.",
    hu: "A szkript {limit} szintnél mélyebben ágyazott, vagy nem adat értékeket tartalmaz.",
    de: "Das Skript ist tiefer als {limit} Ebenen verschachtelt oder enthält Werte, die keine reinen Daten sind."
  },
  scriptTooLarge: {
    en: "The script is {bytes} bytes; at most {limit} are allowed.",
    hu: "A szkript {bytes} bájt; legfeljebb {limit} megengedett.",
    de: "Das Skript ist {bytes} Bytes groß; höchstens {limit} sind erlaubt."
  },
  selfFeedingTrigger: {
    en: "{path}: trigger {name} raises its own event {event} and has no run limit.",
    hu: "{path}: a(z) {name} eseményindító kiváltja a saját {event} eseményét, és nincs futáskorlátja.",
    de: "{path}: Auslöser {name} löst sein eigenes Ereignis {event} aus und hat kein Auslöselimit."
  },
  shipOwnerMismatch: {
    en: "{path}: ship {ship} belongs to another player; it can carry only its owner's units and goods.",
    hu: "{path}: a(z) {ship} hajó másik játékosé; csak a tulajdonosa egységeit és áruit szállíthatja.",
    de: "{path}: Schiff {ship} gehört einem anderen Spieler; es kann nur Einheiten und Waren seines " +
      "Besitzers befördern."
  },
  slotTypeMismatch: {
    en: "{path}: expected {expected}, found {actual}.",
    hu: "{path}: {expected} kell, de {actual} szerepel.",
    de: "{path}: Erwartet wurde {expected}, gefunden wurde {actual}."
  },
  retiredAudio: {
    en: "{path}: {id} was retired from the audio catalog; choose another entry.",
    hu: "{path}: a(z) {id} ki lett vezetve a hangkatalógusból; válassz másik bejegyzést.",
    de: "{path}: {id} wurde aus dem Audiokatalog entfernt; wählen Sie einen anderen Eintrag."
  },
  spawnCountAboveCap: {
    en: "{path}: at most {cap} objects per spawn ({count} given).",
    hu: "{path}: egy létrehozás legfeljebb {cap} objektumot adhat ({count} van megadva).",
    de: "{path}: Höchstens {cap} Objekte pro Erzeugung ({count} angegeben)."
  },
  tagMissing: {
    en: "{path}: no entry of {selector} carries the tag {tag}.",
    hu: "{path}: a(z) {selector} egyik bejegyzése sem viseli a(z) {tag} címkét.",
    de: "{path}: Kein Eintrag von {selector} trägt das Tag {tag}."
  },
  timerNeverStarted: {
    en: "{path}: timer {name} does not start with the map and no action starts it, so it never expires.",
    hu: "{path}: a(z) {name} időzítő nem indul el a pályával, és egyetlen művelet sem indítja el, ezért " +
      "soha nem jár le.",
    de: "{path}: Timer {name} startet nicht mit der Karte, und keine Aktion startet ihn; er läuft daher nie ab."
  },
  tooManyUiAckWaits: {
    en: "{path}: {count} highlights may wait for a click at once; at most {limit} are allowed.",
    hu: "{path}: egyszerre {count} kiemelés várhat kattintásra; legfeljebb {limit} megengedett.",
    de: "{path}: {count} Hervorhebungen können gleichzeitig auf einen Klick warten; höchstens {limit} sind " +
      "erlaubt."
  },
  tooMany: {
    en: "{path}: at most {limit} {kind} are allowed.",
    hu: "{path}: legfeljebb {limit} {kind} megengedett.",
    de: "{path}: Höchstens {limit} {kind} sind erlaubt."
  },
  unboundedForEach: {
    en: "{path}: the loop visits every matching object on the map; add an owner or a region.",
    hu: "{path}: a ciklus a pálya minden illeszkedő objektumát bejárja; adj meg tulajdonost vagy területet.",
    de: "{path}: Die Schleife durchläuft jedes passende Objekt auf der Karte; fügen Sie einen Besitzer oder " +
      "eine Region hinzu."
  },
  unknownAction: { en: "{path}: unknown action {kind}.", hu: "{path}: ismeretlen művelet: {kind}.",
    de: "{path}: Unbekannte Aktion {kind}." },
  unknownAudioAsset: {
    en: "{path}: the uploaded audio {id} is not stored with this map.",
    hu: "{path}: a feltöltött {id} hanganyag nincs ehhez a pályához tárolva.",
    de: "{path}: Die hochgeladene Audiodatei {id} ist nicht mit dieser Karte gespeichert."
  },
  unknownContent: {
    en: "{path}: {id} is not in the content catalog.",
    hu: "{path}: a(z) {id} nem szerepel a tartalomkatalógusban.",
    de: "{path}: {id} ist nicht im Inhaltskatalog."
  },
  unknownCounter: {
    en: "{path}: catch-up does not count {counter}; use ship, tools, produce:<ware> or plant:<tree family>.",
    hu: "{path}: a távollét-pótlás nem számolja ezt: {counter}; használd: ship, tools, produce:<áru> vagy " +
      "plant:<facsalád>.",
    de: "{path}: Die Nachholregelung zählt {counter} nicht; verwenden Sie ship, tools, produce:<Ware> oder " +
      "plant:<Baumfamilie>."
  },
  unknownEvent: { en: "{path}: unknown event {kind}.", hu: "{path}: ismeretlen esemény: {kind}.",
    de: "{path}: Unbekanntes Ereignis {kind}." },
  unknownFamily: {
    en: "{path}: no content catalog entry belongs to the family {family}.",
    hu: "{path}: egyetlen katalógusbejegyzés sem tartozik a(z) {family} családba.",
    de: "{path}: Kein Eintrag des Inhaltskatalogs gehört zur Familie {family}."
  },
  unknownFunction: { en: "{path}: unknown function {kind}.", hu: "{path}: ismeretlen függvény: {kind}.",
    de: "{path}: Unbekannte Funktion {kind}." },
  unknownGroup: {
    en: "{path}: the quest group {groupId} does not exist.",
    hu: "{path}: a(z) {groupId} küldetéscsoport nem létezik.",
    de: "{path}: Die Questgruppe {groupId} existiert nicht."
  },
  unknownLocal: {
    en: "{path}: {name} is not a loop variable here.",
    hu: "{path}: a(z) {name} itt nem ciklusváltozó.",
    de: "{path}: {name} ist hier keine Schleifenvariable."
  },
  unknownPhrasing: {
    en: "{path}: {kind} has no inverse phrasing (it names fewer than two actors).",
    hu: "{path}: a(z) {kind} eseménynek nincs fordított megfogalmazása (két szereplőnél kevesebbet nevez meg).",
    de: "{path}: {kind} hat keine umgekehrte Formulierung (nennt weniger als zwei Akteure)."
  },
  unknownPredicate: { en: "{path}: unknown condition {kind}.", hu: "{path}: ismeretlen feltétel: {kind}.",
    de: "{path}: Unbekannte Bedingung {kind}." },
  unknownQuestAction: {
    en: "{path}: {action} is not a counted player action.",
    hu: "{path}: a(z) {action} nem számolt játékosművelet.",
    de: "{path}: {action} ist keine gezählte Spieleraktion."
  },
  unknownReference: {
    en: "{path} refers to the unknown {kind} {id}.",
    hu: "{path} ismeretlen {kind} elemre hivatkozik: {id}.",
    de: "{path} verweist auf ein unbekanntes {kind}-Element: {id}."
  },
  unknownResponse: {
    en: "{path}: {key} is not provided by every event of this trigger.",
    hu: "{path}: a(z) {key} értéket nem adja meg az eseményindító minden eseménye.",
    de: "{path}: {key} wird nicht von jedem Ereignis dieses Auslösers bereitgestellt."
  },
  unknownSlot: { en: "{path}: {slot} is not a field here.", hu: "{path}: a(z) {slot} itt nem mező.",
    de: "{path}: {slot} ist hier kein Feld." },
  unusedActor: { en: "{path}: actor {name} is never used.", hu: "{path}: a(z) {name} szereplőt semmi sem használja.",
    de: "{path}: Akteur {name} wird nie verwendet." },
  unusedTrigger: {
    en: "{path}: trigger {name} has no events and no action runs it.",
    hu: "{path}: a(z) {name} eseményindítónak nincs eseménye, és egyetlen művelet sem futtatja.",
    de: "{path}: Auslöser {name} hat keine Ereignisse, und keine Aktion führt ihn aus."
  },
  unusedVariable: {
    en: "{path}: variable {name} is never used.",
    hu: "{path}: a(z) {name} változót semmi sem használja.",
    de: "{path}: Variable {name} wird nie verwendet."
  },
  variableInitialTypeMismatch: {
    en: "{path}: the initial value does not match the variable type {type}.",
    hu: "{path}: a kezdőérték nem egyezik a(z) {type} változótípussal.",
    de: "{path}: Der Anfangswert passt nicht zum Variablentyp {type}."
  },
  waitNotSupported: {
    en: "{path}: {kind} cannot be waited on.",
    hu: "{path}: a(z) {kind} műveletre nem lehet várni.",
    de: "{path}: Auf {kind} kann nicht gewartet werden."
  },
  waitTimeoutOutOfRange: {
    en: "{path}: a wait timeout is 1..{limit} seconds.",
    hu: "{path}: a várakozási időkorlát 1..{limit} másodperc.",
    de: "{path}: Ein Warte-Timeout liegt zwischen 1 und {limit} Sekunden."
  },
  waitUntilWithoutDependencies: {
    en: "{path}: this condition reads nothing that can change, so the wait never ends.",
    hu: "{path}: ez a feltétel semmi változót nem olvas, így a várakozás sosem ér véget.",
    de: "{path}: Diese Bedingung liest nichts, was sich ändern kann, daher endet die Wartezeit nie."
  },
  waitUntilWithoutTimeout: {
    en: "{path}: this wait has no timeout and may wait forever.",
    hu: "{path}: ennek a várakozásnak nincs időkorlátja, örökké várhat.",
    de: "{path}: Diese Wartezeit hat keinen Timeout und kann ewig dauern."
  },
  waitWithoutTimeout: {
    en: "{path}: waiting for {kind} needs a timeout.",
    hu: "{path}: a(z) {kind} művelet bevárásához időkorlát kell.",
    de: "{path}: Das Warten auf {kind} erfordert einen Timeout."
  },
  wildlifePinsAboveLimit: {
    en: "{count} regions keep wildlife awake for region events; more than {limit} cost performance.",
    hu: "{count} terület tartja ébren a vadakat a területeseményekhez; {limit} felett ez teljesítményt igényel.",
    de: "{count} Regionen halten die Wildtiere für Regionsereignisse wach; mehr als {limit} belasten die " +
      "Leistung."
  }
} as const satisfies Record<string, TranslatableText>;

export type ScriptIssueCode = keyof typeof SCRIPT_ISSUE_MESSAGES;
