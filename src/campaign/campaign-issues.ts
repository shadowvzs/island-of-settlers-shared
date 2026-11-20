import { resolveTranslatableText, type TranslatableText } from "./campaign-text.ts";

/**
 * Structured validation results. `code` is the stable message key, `path` points at the offending field
 * (e.g. `quests[2].trigger.regionId`) and `params` fill the message template. The editor shows them through
 * `formatCampaignIssue`; nothing here depends on a UI library.
 */
export const CAMPAIGN_ISSUE_MESSAGES = {
  actorNotUnit: {
    en: "{path}: {actorRef} is not a unit, so it cannot walk or turn.",
    hu: "{path}: {actorRef} nem egység, ezért nem tud menni vagy fordulni.",
    de: "{path}: {actorRef} ist keine Einheit und kann daher weder laufen noch sich drehen."
  },
  alliedSlotUnsupported: {
    en: "Player slot {faction} is allied with the player; allied computer players are not supported yet.",
    hu: "A(z) {faction}. játékoshely szövetséges; szövetséges gépi játékos még nem támogatott.",
    de: "Spielerplatz {faction} ist mit dem Spieler verbündet; verbündete Computerspieler werden noch nicht " +
      "unterstützt."
  },
  availabilityWindowInvalid: {
    en: "The availability window ends before it starts.",
    hu: "Az elérhetőségi időszak vége a kezdete előtt van.",
    de: "Das Verfügbarkeitsfenster endet, bevor es beginnt."
  },
  blacklistedTriggerBuilding: {
    en: "Quest {questId} needs building type {buildingType}, which is disabled on this map.",
    hu: "A(z) {questId} küldetéshez {buildingType} típusú épület kell, de ez ezen a pályán tiltott.",
    de: "Quest {questId} benötigt den Gebäudetyp {buildingType}, der auf dieser Karte deaktiviert ist."
  },
  blacklistedUnitType: {
    en: "{path} gives the player {unitType} units, which cannot be trained on this map.",
    hu: "{path} {unitType} egységeket ad a játékosnak, de ezek ezen a pályán nem képezhetők.",
    de: "{path} gibt dem Spieler {unitType}-Einheiten, die auf dieser Karte nicht ausgebildet werden können."
  },
  buildingLevelOutOfRange: {
    en: "Building type {buildingType}: level {level} is outside 1–{maxLevel}.",
    hu: "{buildingType} típusú épület: a(z) {level}. szint kívül esik az 1–{maxLevel} tartományon.",
    de: "Gebäudetyp {buildingType}: Stufe {level} liegt außerhalb von 1–{maxLevel}."
  },
  campaignCycle: {
    en: "The path from map {from} to map {to} closes a loop; a campaign path can never lead back.",
    hu: "A(z) {from} pályáról a(z) {to} pályára vezető útvonal kört zár; egy hadjáratútvonal sosem " +
      "vezethet vissza.",
    de: "Der Pfad von Karte {from} zur Karte {to} schließt eine Schleife; ein Kampagnenpfad kann nie " +
      "zurückführen."
  },
  campaignEdgeDuplicate: {
    en: "Exit {exit} of map {mapId} leads to the same target more than once.",
    hu: "A(z) {mapId} pálya {exit} kijárata többször ugyanahhoz a célhoz vezet.",
    de: "Ausgang {exit} der Karte {mapId} führt mehr als einmal zum selben Ziel."
  },
  campaignEdgeUnknownExit: {
    en: "{path}: map {mapId} has no exit {exit}.",
    hu: "{path}: a(z) {mapId} pályának nincs {exit} kijárata.",
    de: "{path}: Karte {mapId} hat keinen Ausgang {exit}."
  },
  campaignEdgeUnknownMap: {
    en: "{path}: map {mapId} is not listed in this campaign.",
    hu: "{path}: a(z) {mapId} pálya nem szerepel ebben a hadjáratban.",
    de: "{path}: Karte {mapId} ist in dieser Kampagne nicht aufgeführt."
  },
  campaignExitUnused: {
    en: "{path}: no endMap of the map script names exit {exit}; the map can never be won through it.",
    hu: "{path}: a pályaszkript egyetlen endMap művelete sem nevezi meg a(z) {exit} kijáratot; " +
      "a pálya így sosem nyerhető meg rajta.",
    de: "{path}: Kein endMap des Kartenskripts nennt den Ausgang {exit}; " +
      "über ihn kann die Karte nie gewonnen werden."
  },
  campaignExitWithoutEdge: {
    en: "Exit {exit} of map {mapId} leads nowhere: connect it to a map or let it end the campaign.",
    hu: "A(z) {mapId} pálya {exit} kijárata sehova nem vezet: kösd össze egy pályával, vagy hagyd, hogy " +
      "lezárja a hadjáratot.",
    de: "Ausgang {exit} der Karte {mapId} führt nirgendwohin: Verbinden Sie ihn mit einer Karte, oder " +
      "lassen Sie ihn die Kampagne beenden."
  },
  campaignHasNoMaps: { en: "The campaign has no maps.", hu: "A hadjáratnak nincs pályája.",
    de: "Die Kampagne hat keine Karten." },
  campaignImageDeleted: {
    en: "The campaign map image {imageId} was deleted.",
    hu: "A hadjárattérkép képe ({imageId}) törölve lett.",
    de: "Das Kartenbild {imageId} der Kampagne wurde gelöscht."
  },
  campaignImageMissing: {
    en: "The campaign has no map image yet.",
    hu: "A hadjáratnak még nincs térképképe.",
    de: "Die Kampagne hat noch kein Kartenbild."
  },
  campaignMapFileMissing: {
    en: "Map {mapId} has no saved map file yet: open it in the map editor and save it.",
    hu: "A(z) {mapId} pályának még nincs mentett pályafájlja: nyisd meg a pályaszerkesztőben, és mentsd el.",
    de: "Karte {mapId} hat noch keine gespeicherte Kartendatei: Öffnen Sie sie im Karteneditor und " +
      "speichern Sie sie."
  },
  campaignMapMissing: {
    en: "Map {mapId} is listed but does not exist.",
    hu: "A(z) {mapId} pálya szerepel a listában, de nem létezik.",
    de: "Karte {mapId} ist aufgeführt, existiert aber nicht."
  },
  campaignMapHomeUnlock: {
    en: "{path}: this unlock condition needs a home island; a game without a home island ignores it.",
    hu: "{path}: ez a feloldási feltétel hazai szigetet igényel; a hazai sziget nélküli játék figyelmen " +
      "kívül hagyja.",
    de: "{path}: Diese Freischaltbedingung benötigt eine Heimatinsel; ein Spiel ohne Heimatinsel " +
      "ignoriert sie."
  },
  campaignMapNoLaunchCargo: {
    en: "Map {mapId} ships no settlers and no soldiers as required cargo: an expedition from home would land empty.",
    hu: "A(z) {mapId} pálya nem szállít telepest és katonát kötelező rakományként: az otthonról induló " +
      "expedíció üresen szállna partra.",
    de: "Karte {mapId} verschifft keine Siedler und keine Soldaten als Pflichtfracht: Eine Expedition " +
      "von zu Hause würde leer landen."
  },
  campaignMapNoRewards: {
    en: "Map {mapId} gives no victory rewards; with a home island a won map should pay something home.",
    hu: "A(z) {mapId} pálya nem ad győzelmi jutalmat; hazai sziget esetén egy megnyert pályának " +
      "juttatnia kellene valamit haza.",
    de: "Karte {mapId} gibt keine Siegesbelohnungen; mit einer Heimatinsel sollte eine gewonnene Karte " +
      "etwas in die Heimat zahlen."
  },
  campaignMapNoStoryStart: {
    en: "The map file starts without settlers or soldiers: a start without a home island could not play it.",
    hu: "A pályafájl telepesek és katonák nélkül indul: hazai sziget nélküli kezdéskor nem lehetne játszani.",
    de: "Die Kartendatei startet ohne Siedler oder Soldaten: " +
      "Ein Start ohne Heimatinsel könnte sie nicht spielen."
  },
  campaignMapNotOwned: {
    en: "Map {mapId} belongs to another campaign.",
    hu: "A(z) {mapId} pálya egy másik hadjárathoz tartozik.",
    de: "Karte {mapId} gehört zu einer anderen Kampagne."
  },
  campaignMapNodeMissing: {
    en: "Map {mapId} has no position on the campaign map.",
    hu: "A(z) {mapId} pályának nincs helye a hadjárattérképen.",
    de: "Karte {mapId} hat keine Position auf der Kampagnenkarte."
  },
  campaignMapNotReady: {
    en: "Map {mapId} is still a draft.",
    hu: "A(z) {mapId} pálya még piszkozat.",
    de: "Karte {mapId} ist noch ein Entwurf."
  },
  campaignMapUnreachable: {
    en: "Map {mapId} cannot be reached from any start map.",
    hu: "A(z) {mapId} pálya egyetlen kezdőpályáról sem érhető el.",
    de: "Karte {mapId} ist von keiner Startkarte aus erreichbar."
  },
  campaignNoEnding: {
    en: "No path of the campaign reaches a campaign end.",
    hu: "A hadjárat egyetlen útvonala sem ér el hadjárat-végpontot.",
    de: "Kein Pfad der Kampagne erreicht ein Kampagnenende."
  },
  campaignNoStartMap: {
    en: "The campaign has no start map.",
    hu: "A hadjáratnak nincs kezdőpályája.",
    de: "Die Kampagne hat keine Startkarte."
  },
  campaignPreviousMapLockUnused: {
    en: "Map {mapId} still requires the previous map; a branching campaign ignores that lock: remove it.",
    hu: "A(z) {mapId} pálya még megköveteli az előző pályát; az elágazó hadjárat figyelmen kívül hagyja " +
      "ezt a zárat: távolítsd el.",
    de: "Karte {mapId} setzt noch die vorherige Karte voraus; eine verzweigte Kampagne ignoriert diese " +
      "Sperre: Entfernen Sie sie."
  },
  campaignStartHasIncoming: {
    en: "Start map {mapId} is also the target of a path.",
    hu: "A(z) {mapId} kezdőpálya egyben egy útvonal célpontja is.",
    de: "Startkarte {mapId} ist auch das Ziel eines Pfads."
  },
  duplicateId: { en: "The id {id} is used more than once.", hu: "A(z) {id} azonosító többször szerepel.",
    de: "Die ID {id} wird mehr als einmal verwendet." },
  factionWithoutSlot: {
    en: "Enemy faction {faction} has units or buildings but no player slot.",
    hu: "A(z) {faction}. ellenséges frakciónak vannak egységei vagy épületei, de nincs játékoshelye.",
    de: "Die feindliche Fraktion {faction} hat Einheiten oder Gebäude, aber keinen Spielerplatz."
  },
  invalidField: { en: "Invalid value at {path}.", hu: "Érvénytelen érték: {path}.",
    de: "Ungültiger Wert bei {path}." },
  invalidHumanSlot: {
    en: "The map needs exactly one human player slot, with faction 0.",
    hu: "A pályán pontosan egy emberi játékoshely kell, 0-s frakcióval.",
    de: "Die Karte benötigt genau einen menschlichen Spielerplatz mit Fraktion 0."
  },
  invalidRegionShape: {
    en: "Region {regionId} has an invalid shape (radius or size zero, or a missing number).",
    hu: "A(z) {regionId} terület alakja érvénytelen (nulla sugár vagy méret, vagy hiányzó szám).",
    de: "Region {regionId} hat eine ungültige Form (Radius oder Größe null oder eine fehlende Zahl)."
  },
  landingHarbourMissing: {
    en: "Place the landing harbour: it is the player's start on a campaign map.",
    hu: "Helyezd el a kikötőt a partraszálláshoz: ez a játékos kezdőpontja a hadjárat pályáján.",
    de: "Platzieren Sie den Landungshafen: Er ist der Startpunkt des Spielers auf einer Kampagnenkarte."
  },
  landingHarbourNotOnSpot: {
    en: "The landing harbour must stand on one of the map's harbour spots.",
    hu: "A partraszállási kikötőnek a pálya egyik kikötőhelyén kell állnia.",
    de: "Der Landungshafen muss auf einem der Hafenplätze der Karte stehen."
  },
  lodgeInBuildingList: {
    en: "The Commander's Lodge is switched with its own \"Lodge allowed\" setting, not in the building list.",
    hu: "A parancsnoki szállást a saját „Szállás engedélyezve” beállítása kapcsolja, nem az épületlista.",
    de: "Die Kommandantenhütte wird über ihre eigene Einstellung „Hütte erlaubt“ gesteuert, nicht über die " +
      "Gebäudeliste."
  },
  lodgeWithoutCommander: {
    en: "The Commander's Lodge is allowed while the commander is not.",
    hu: "A parancsnoki szállás engedélyezett, a parancsnok viszont nem.",
    de: "Die Kommandantenhütte ist erlaubt, der Kommandant jedoch nicht."
  },
  longRunningSequence: {
    en: "Sequence {sequenceId} keeps the world running for {seconds} s; " +
      "the enemy acts while the player has no control.",
    hu: "A(z) {sequenceId} jelenet {seconds} mp-ig futni hagyja a világot; " +
      "az ellenfél közben cselekszik, a játékos pedig nem irányíthat.",
    de: "Sequenz {sequenceId} hält die Welt {seconds} s lang am Laufen; " +
      "der Gegner handelt, während der Spieler keine Kontrolle hat."
  },
  missingActorReference: {
    en: "{path} refers to the unknown actor {actorRef}.",
    hu: "{path} ismeretlen szereplőre hivatkozik: {actorRef}.",
    de: "{path} verweist auf den unbekannten Akteur {actorRef}."
  },
  mapFileNotCampaign: {
    en: "The map file is not a campaign map (its scenario kind must be campaign).",
    hu: "A pályafájl nem hadjárat-pálya (a forgatókönyv típusának hadjáratnak kell lennie).",
    de: "Die Kartendatei ist keine Kampagnenkarte (ihr Szenariotyp muss Kampagne sein)."
  },
  mapFileRulesIgnored: {
    en: "The map file's own building ban or commander setting is ignored; the campaign map settings apply.",
    hu: "A pályafájl saját épülettiltása vagy parancsnok-beállítása figyelmen kívül marad; " +
      "a hadjárat pályabeállításai érvényesek.",
    de: "Das eigene Gebäudeverbot oder die Kommandanteneinstellung der Kartendatei wird ignoriert; " +
      "es gelten die Einstellungen der Kampagnenkarte."
  },
  mapRulesXpReward: {
    en: "The map rewards {xp} XP, but its map rules switch experience off on this map.",
    hu: "A pálya {xp} XP-t ad, de a pályaszabályai kikapcsolják a tapasztalatszerzést ezen a pályán.",
    de: "Die Karte belohnt {xp} XP, aber ihre Kartenregeln schalten die Erfahrung auf dieser Karte aus."
  },
  mapScenarioError: { en: "Map: {message}", hu: "Pálya: {message}", de: "Karte: {message}" },
  missingCueReference: {
    en: "{path} refers to the unknown sound or music {cueId}.",
    hu: "{path} ismeretlen hangra vagy zenére hivatkozik: {cueId}.",
    de: "{path} verweist auf einen unbekannten Ton oder eine unbekannte Musik: {cueId}."
  },
  missingFallbackText: {
    en: "{path} has no English text (the fallback language).",
    hu: "{path} angol szövege hiányzik (ez a tartalék nyelv).",
    de: "{path}: Der englische Text fehlt (die Ausweichsprache)."
  },
  missingImage: {
    en: "Quest {questId} refers to the deleted image {imageId}.",
    hu: "A(z) {questId} küldetés egy törölt képre hivatkozik: {imageId}.",
    de: "Quest {questId} verweist auf das gelöschte Bild {imageId}."
  },
  missingPortraitImage: {
    en: "{path} refers to the deleted image {imageId}.",
    hu: "{path} egy törölt képre hivatkozik: {imageId}.",
    de: "{path} verweist auf das gelöschte Bild {imageId}."
  },
  missingRegionReference: {
    en: "{path} refers to the deleted region {regionId}.",
    hu: "{path} egy törölt területre hivatkozik: {regionId}.",
    de: "{path} verweist auf die gelöschte Region {regionId}."
  },
  missingQuestReference: {
    en: "Quest {questId} requires the deleted quest {reference}.",
    hu: "A(z) {questId} küldetés egy törölt küldetést igényel: {reference}.",
    de: "Quest {questId} setzt die gelöschte Quest {reference} voraus."
  },
  missingScenarioBuilding: {
    en: "{path} refers to the deleted map building {buildingId}.",
    hu: "{path} egy törölt pályaépületre hivatkozik: {buildingId}.",
    de: "{path} verweist auf das gelöschte Kartengebäude {buildingId}."
  },
  missingSequenceReference: {
    en: "{path} refers to the deleted sequence {sequenceId}.",
    hu: "{path} egy törölt jelenetre hivatkozik: {sequenceId}.",
    de: "{path} verweist auf die gelöschte Sequenz {sequenceId}."
  },
  missingShotReference: {
    en: "{path} refers to the deleted camera shot {shotId}.",
    hu: "{path} egy törölt kamerabeállításra hivatkozik: {shotId}.",
    de: "{path} verweist auf die gelöschte Kameraeinstellung {shotId}."
  },
  missingSpeakerExpression: {
    en: "{path}: speaker {speakerId} has no {expression} portrait; the neutral one is shown.",
    hu: "{path}: {speakerId} beszélőnek nincs {expression} portréja; a semleges látszik.",
    de: "{path}: Sprecher {speakerId} hat kein Porträt für {expression}; das neutrale Porträt wird angezeigt."
  },
  missingSpeakerReference: {
    en: "{path} refers to the unknown speaker {speakerId}.",
    hu: "{path} ismeretlen beszélőre hivatkozik: {speakerId}.",
    de: "{path} verweist auf den unbekannten Sprecher {speakerId}."
  },
  missingTranslation: {
    en: "{path} has no {language} translation.",
    hu: "{path} {language} fordítása hiányzik.",
    de: "{path}: Die Übersetzung für {language} fehlt."
  },
  multipleHostileFactions: {
    en: "The map has {count} hostile factions; only one is supported until teams exist.",
    hu: "A pályán {count} ellenséges frakció van; csapatok nélkül csak egy támogatott.",
    de: "Die Karte hat {count} feindliche Fraktionen; bis Teams existieren, wird nur eine unterstützt."
  },
  noSoldierSource: {
    en: "The victory rule {rule} needs fighting, but no soldiers are shipped and none can be trained.",
    hu: "A(z) {rule} győzelmi feltételhez harc kell, de nincs szállított katona, és képezni sem lehet.",
    de: "Die Siegbedingung {rule} benötigt Kämpfe, aber es werden keine Soldaten geliefert, und es können " +
      "auch keine ausgebildet werden."
  },
  overlappingCameraSteps: {
    en: "{path}: camera steps {first} and {second} run at the same time.",
    hu: "{path}: a(z) {first} és {second} kameralépés egyszerre fut.",
    de: "{path}: Die Kameraschritte {first} und {second} laufen gleichzeitig."
  },
  playerHeadquartersOnCampaign: {
    en: "A campaign map has no player headquarters; the player starts at the landing harbour.",
    hu: "A hadjárat pályáján nincs játékos-főhadiszállás; a játékos a partraszállási kikötőnél kezd.",
    de: "Eine Kampagnenkarte hat kein Hauptquartier des Spielers; der Spieler startet am Landungshafen."
  },
  prerequisitesTriggerWithoutPrerequisites: {
    en: "Quest {questId} starts when its prerequisites are done, but it has none.",
    hu: "A(z) {questId} küldetés az előfeltételei teljesülésekor indul, de nincs előfeltétele.",
    de: "Quest {questId} startet, wenn ihre Voraussetzungen erfüllt sind, aber sie hat keine."
  },
  protectedBuildingDisabled: {
    en: "Building type {buildingType} is needed for landing and logistics and cannot be disabled.",
    hu: "A(z) {buildingType} épülettípus a partraszálláshoz és a logisztikához kell, nem tiltható.",
    de: "Der Gebäudetyp {buildingType} wird für Landung und Logistik benötigt und kann nicht deaktiviert werden."
  },
  questPrerequisiteCycle: {
    en: "Quest {questId} is part of a circular prerequisite chain.",
    hu: "A(z) {questId} küldetés körkörös előfeltétel-láncban szerepel.",
    de: "Quest {questId} ist Teil einer zirkulären Voraussetzungskette."
  },
  regionOutOfBounds: {
    en: "Region {regionId} reaches outside the map.",
    hu: "A(z) {regionId} terület kilóg a pályáról.",
    de: "Region {regionId} reicht über die Karte hinaus."
  },
  repeatableHomeReward: {
    en: "Quest {questId} is repeatable and pays a home reward on every success.",
    hu: "A(z) {questId} küldetés ismételhető, és minden sikernél otthoni jutalmat ad.",
    de: "Quest {questId} ist wiederholbar und zahlt bei jedem Erfolg eine Heimatbelohnung."
  },
  sequenceTooLong: {
    en: "Sequence {sequenceId} lasts {seconds} s; at most {limit} s are allowed.",
    hu: "A(z) {sequenceId} jelenet {seconds} mp hosszú; legfeljebb {limit} mp megengedett.",
    de: "Sequenz {sequenceId} dauert {seconds} s; höchstens {limit} s sind erlaubt."
  },
  shotBelowMinimalPitch: {
    en: "Camera shot {shotId} is flatter than the Minimal limit; phones show it steeper.",
    hu: "A(z) {shotId} kamerabeállítás laposabb a Minimális korlátnál; telefonon meredekebben látszik.",
    de: "Kameraeinstellung {shotId} ist flacher als die Minimal-Grenze; auf Telefonen wird sie steiler " +
      "angezeigt."
  },
  speakLineTooLong: {
    en: "{path}: the {language} line has {length} characters; split it (pages hold {limit}).",
    hu: "{path}: a(z) {language} sor {length} karakteres; bontsd fel (egy oldal {limit} karakter).",
    de: "{path}: Die Zeile für {language} hat {length} Zeichen; teilen Sie sie auf (eine Seite fasst {limit})."
  },
  stepOutsideCinematicMode: {
    en: "{path}: a {kind} step needs cinematic mode to be on.",
    hu: "{path}: a(z) {kind} lépéshez a filmes módnak bekapcsolva kell lennie.",
    de: "{path}: Ein Schritt vom Typ {kind} erfordert den Filmmodus."
  },
  supplyAmountAboveShip: {
    en: "Supply line {line}: {amount} is more than one ship carries ({capacity}).",
    hu: "{line} utánpótlás: {amount} több, mint amennyit egy hajó elvisz ({capacity}).",
    de: "Nachschublinie {line}: {amount} ist mehr, als ein Schiff befördert ({capacity})."
  },
  troopPointsLow: {
    en: "The shipped soldiers are worth {required} points, under half of the enemy's {enemy}.",
    hu: "A szállított katonák {required} pontot érnek, ez kevesebb az ellenség {enemy} pontjának felénél.",
    de: "Die gelieferten Soldaten sind {required} Punkte wert, weniger als die Hälfte der {enemy} Punkte des " +
      "Gegners."
  },
  unknownBuildingType: {
    en: "{path} uses the unknown building type {buildingType}.",
    hu: "{path} ismeretlen épülettípust használ: {buildingType}.",
    de: "{path} verwendet den unbekannten Gebäudetyp {buildingType}."
  },
  unknownUnitType: {
    en: "{path} uses the unknown unit type {unitType}.",
    hu: "{path} ismeretlen egységtípust használ: {unitType}.",
    de: "{path} verwendet den unbekannten Einheitentyp {unitType}."
  },
  unknownWare: { en: "{path} uses the unknown ware {ware}.", hu: "{path} ismeretlen árut használ: {ware}.",
    de: "{path} verwendet die unbekannte Ware {ware}." },
  unreachableRegion: {
    en: "Region {regionId} is in water or cannot be reached from the landing.",
    hu: "A(z) {regionId} terület vízben van, vagy a partraszállási pontról nem érhető el.",
    de: "Region {regionId} liegt im Wasser oder ist vom Landungspunkt aus nicht erreichbar."
  },
  untrainableSoldierType: {
    en: "Quest {questId} needs {soldierType} soldiers, which cannot be trained or shipped in that number.",
    hu: "A(z) {questId} küldetéshez {soldierType} katonák kellenek, " +
      "akik ennyien nem képezhetők és nem szállíthatók.",
    de: "Quest {questId} benötigt {soldierType}-Soldaten, die in dieser Zahl weder ausgebildet noch geliefert " +
      "werden können."
  },
  victoryTargetMissing: {
    en: "The victory rule {rule} has no enemy target on the map (headquarters, building or unit it needs).",
    hu: "A(z) {rule} győzelmi feltételhez nincs ellenséges cél a pályán (a szükséges főhadiszállás, épület " +
      "vagy egység).",
    de: "Die Siegbedingung {rule} hat kein feindliches Ziel auf der Karte (das benötigte Hauptquartier, " +
      "Gebäude oder die benötigte Einheit)."
  },
  walkInPausedSequence: {
    en: "{path}: units cannot walk while sequence {sequenceId} pauses the world.",
    hu: "{path}: az egységek nem mozoghatnak, amíg a(z) {sequenceId} jelenet megállítja a világot.",
    de: "{path}: Einheiten können nicht laufen, während Sequenz {sequenceId} die Welt anhält."
  },
  waveAboveEnemyCap: {
    en: "Quest {questId} sends {amount} enemy soldiers; only {cap} can be alive at once.",
    hu: "A(z) {questId} küldetés {amount} ellenséges katonát küld; egyszerre csak {cap} lehet életben.",
    de: "Quest {questId} entsendet {amount} feindliche Soldaten; gleichzeitig können nur {cap} leben."
  },
  weatherSeasonMismatch: {
    en: "{path}: {weather} does not suit {season}.",
    hu: "{path}: a(z) {weather} időjárás nem illik ehhez az évszakhoz: {season}.",
    de: "{path}: {weather} passt nicht zu {season}."
  }
} as const satisfies Record<string, TranslatableText>;

export type CampaignIssueCode = keyof typeof CAMPAIGN_ISSUE_MESSAGES;
export type CampaignIssueSeverity = "error" | "warning";

export interface CampaignIssue {
  code: CampaignIssueCode;
  params: Readonly<Record<string, string | number>>;
  path: string;
  severity: CampaignIssueSeverity;
}

export interface CampaignValidationResult {
  errors: CampaignIssue[];
  /** True when there is no error; warnings never block Ready. */
  ready: boolean;
  warnings: CampaignIssue[];
}

export const campaignIssue = (
  severity: CampaignIssueSeverity, code: CampaignIssueCode, path: string,
  params: Readonly<Record<string, string | number>> = {}
): CampaignIssue => ({ code, params, path, severity });

export const campaignValidationResult = (issues: readonly CampaignIssue[]): CampaignValidationResult => {
  const errors = issues.filter(issue => issue.severity === "error");
  return { errors, ready: errors.length === 0, warnings: issues.filter(issue => issue.severity === "warning") };
};

/** The issue's message in `language` (English fallback), with `{name}` placeholders filled. */
export const formatCampaignIssue = (issue: CampaignIssue, language: string) => {
  const template = resolveTranslatableText(CAMPAIGN_ISSUE_MESSAGES[issue.code], language);
  const values: Readonly<Record<string, string | number>> = { ...issue.params, path: issue.path };
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
};
