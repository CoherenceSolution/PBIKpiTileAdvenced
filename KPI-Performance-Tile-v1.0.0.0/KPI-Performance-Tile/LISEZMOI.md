# KPI Performance Tile — custom visual Power BI (V1.0.0.0)

Livrable construit à partir du cahier des charges « Custom Visual Power BI — KPI Performance Tile ».
Une instance du visual = un KPI. Power BI calcule (DAX), le visual présente, colore le badge et gère les interactions.

## Contenu du zip

| Élément | Rôle |
|---|---|
| `KPIPerformanceTile-1.0.0.0.pbiviz` | **Le visual, prêt à importer dans Power BI** (icône incluse) |
| `docs/01-guide-utilisation.md` | Champs, panneau de format, navigation, Embedded, pièges connus |
| `docs/02-challenge-et-decisions.md` | Points du cahier des charges challengés et décisions prises |
| `docs/03-criteres-acceptation.md` | Les critères d'acceptation V1 (§29) et comment chacun a été vérifié |
| `exemple/kpi_demo.csv` | Données de démonstration (3 KPI × 36 mois) pour un essai en 5 minutes |
| `exemple/mesures_exemple.dax` | Modèles de mesures DAX (MAU : projection, N-1, écarts, statut) |
| `icone/` | Icône du visual : `icon.png` (20 × 20, format attendu par Power BI), source `icon.svg`, aperçu agrandi |
| `apercu/` | Captures du rendu (tuile de référence, exemples MAU / YAU / Stickiness, tous les états) |
| `source/` | Projet complet `pbiviz` (TypeScript, tests, lint, harnais de rendu) pour faire évoluer le visual |

## Installation

1. Power BI Desktop → volet **Visualisations** → **…** → **Importer un visuel à partir d'un fichier** → choisir `KPIPerformanceTile-1.0.0.0.pbiviz`.
2. L'icône du visual apparaît dans le volet ; cliquer dessus pour le poser sur la page. Sans champ, il affiche sa page d'accueil (champs requis / recommandés / facultatifs).
3. Pour une diffusion interne : portail d'administration Power BI → **Visuels d'organisation** → ajouter le `.pbiviz`. Les rapports se mettent alors à jour avec les versions suivantes.

Prérequis : Power BI Desktop récent ou le service Power BI (API des visuals 5.11). Power BI Report Server n'est pas visé.

## Essai en 5 minutes avec les données de démonstration

1. **Obtenir les données** → Texte/CSV → `exemple/kpi_demo.csv`. Typer `Period` en *Date*.
2. Poser le visual, puis filtrer le visual sur `KPI Code = RET-001` (volet Filtres).
3. Glisser les colonnes dans les champs du même nom : `Period` (choisir **Period**, pas *Hiérarchie de dates*), `Primary Value`, `Secondary Value`, `Actual` → *Actual Value*, `Projected` → *Projected Value*, `Projection Remaining`, `Previous Year` → *Previous Year Value*, `Target` → *Target Value*, `Var vs Previous Month` → *Comparison 1 Value*, `Var vs Previous Year` → *Comparison 2 Value*, `Is Current Period`, `KPI Code` → *KPI Technical Name*, `KPI Title`, `KPI Category`, `Status Code`.
   Les colonnes numériques sont agrégées en *Somme* (une ligne par période : la somme est la valeur) ; pour les colonnes texte, vérifier que l'agrégation est **Premier**.
4. Formater `Var vs …` en pourcentage (le visual hérite du format de la mesure), ou choisir *Display format = Percentage* dans les cartes *Comparison 1 / 2*.
5. Dupliquer le visual et changer le filtre (`RET-002`, `RET-003`) : une instance par KPI.

Dans un vrai rapport, remplacer ces colonnes par des mesures : voir `exemple/mesures_exemple.dax`.

## Ce qui a été vérifié — et ce qui reste à valider chez vous

Vérifié ici, sur le code du `.pbiviz` compilé :

- packaging officiel `pbiviz package` (outils 7.2.1) sans erreur, lint Power BI sans erreur, TypeScript strict ;
- 117 tests unitaires (périodes, formats numériques, conversion des données, statut, textes, layout, cohérence `capabilities.json`) ;
- 87 contrôles fonctionnels dans Chrome contre un **faux host Power BI** : contenu de la tuile de référence, sélection, Ctrl+clic, clavier, tooltips, menu contextuel, actions URL, panneau de format (241 propriétés), 24 scénarios × 9 tailles sans erreur ni débordement.

**Non vérifié : l'exécution dans Power BI Desktop / Service réels**, qui n'étaient pas disponibles dans l'environnement de développement. À contrôler lors de la recette (liste détaillée dans `docs/03-criteres-acceptation.md`) : import du visual, liaison des champs, affichage du panneau de format, filtrage croisé, report page tooltips, extraction-forage depuis le menu contextuel, mode contraste élevé de Windows.

## Faire évoluer le visual

```
cd source
npm install
npm test            # tests unitaires
npm run check       # TypeScript strict
npm run lint
npm run package     # régénère capabilities.json + ressources, puis dist/*.pbiviz
npm start           # serveur de développement pbiviz (visual "Developer" dans le service)
```

- Les champs (`src/roles.ts`) et les propriétés du panneau de format (`src/settingsSchema.ts`) sont déclarés **une seule fois** ; `capabilities.json` et `stringResources/en-US/resources.resjson` sont générés (`npm run generate`). Ajouter une option = une ligne dans le schéma.
- Auteur, version, description : `pbiviz.json`. Changer le `guid` crée un visual distinct ; le conserver pour qu'une nouvelle version remplace l'ancienne dans les rapports.
- `harness/index.html` rejoue les scénarios dans un navigateur, sans Power BI (`node harness/extract.mjs` après un `npm run package`).
- Traduction FR/NL du panneau de format : copier `stringResources/en-US/resources.resjson` dans `stringResources/fr-FR/` (ou `nl-NL/`) et traduire les valeurs — aucun code à modifier.

Auteur déclaré dans le package : Leyder Mathis — mathis.leyder@cm.be. Faute de site web, l'URL de support est `mailto:mathis.leyder@cm.be` (modifiable dans `pbiviz.json`).
