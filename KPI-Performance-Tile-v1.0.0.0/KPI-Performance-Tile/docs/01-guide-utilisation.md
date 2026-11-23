# Guide d'utilisation — KPI Performance Tile

## 1. Champs (data roles)

Un seul champ est accepté par rôle (10 pour *Tooltip Fields*). Le visual reçoit **une ligne agrégée par période**.

| Champ | Type | Requis | Usage |
|---|---|---|---|
| Period | Colonne date, texte ou nombre | Oui | Axe temporel. Reconnus : dates, `2026-01`, `202601`, `Q1 2026`, `2026 Q1`, `T1 2026`, `2026`, noms de mois EN/FR/NL |
| Period Sort Key | Colonne numérique ou date | Non | Tri chronologique quand Period est un texte libre |
| Primary Value | Mesure | Oui | Valeur principale (Actual, Projected ou autre : libre) |
| Secondary Value | Mesure | Non | Valeur plus petite sous la principale |
| Secondary Value Label | Mesure texte | Non | Libellé de la valeur secondaire (défaut : `Actual`) |
| Actual Value | Mesure | Recommandé | Barre pleine du graphique. À défaut, Primary Value est utilisée |
| Projected Value | Mesure | Non | Total projeté de la période ouverte |
| Projection Remaining | Mesure | Non | Segment hachuré empilé. À défaut : Projected − Actual, borné à 0 |
| Previous Year Value | Mesure | Recommandé | Barre de comparaison N-1 |
| Target Value | Mesure | Non | Target. Vide = ligne masquée |
| Target Variance | Mesure | Non | Écart à la target (si *Show target variance*) — **ajout par rapport au §18** |
| Comparison 1 / 2 Value | Mesure (nombre ou texte) | Non | Écarts génériques |
| Comparison 1 / 2 Label | Mesure texte | Non | Libellés des écarts |
| Status Value | Mesure | Non | Valeur comparée aux seuils (mode Thresholds) |
| Status Code | Mesure texte | Non | `ON_TARGET`, `NEAR_TARGET`, `BELOW_TARGET`, `ABOVE_TARGET`, `NO_TARGET`, `NO_DATA`, `CUSTOM` |
| Status Label | Mesure texte | Non | Texte du badge |
| Is Current Period | Mesure 0/1 ou booléen | Recommandé | Période ouverte (« in progress ») |
| KPI Technical Name / Title / Subtitle / Category | Mesure texte | Non | Identification dynamique ; sinon textes statiques du panneau de format |
| Action URL | Mesure texte | Non | URL `http(s)` des actions *Open URL* |
| Tooltip Fields | Mesures | Non | Lignes supplémentaires des tooltips (ex. date de mise à jour) |

### Quelle période alimente l'en-tête ?

Valeur principale, target, badge et comparaisons sont lus sur **la période marquée Is Current Period ; à défaut, la plus récente ayant une valeur** (choix validé). Réglable : *Chart → Periods → Header period* (`Current period, else latest` / `Latest period` / `Selected bar`).

### Pièges à connaître

- **Segment sur une seule période** : si un segment de la page ne laisse qu'un mois, le visual ne reçoit qu'une barre. Désactiver l'interaction du segment vers la tuile (*Format → Modifier les interactions*), ou filtrer la tuile par une plage relative.
- **Hiérarchie de dates** : glisser le champ date lui-même (*Period*), pas la hiérarchie automatique Année/Trimestre/Mois.
- **Mesures constantes** (ex. `"RET-001"`, target fixe) : elles renvoient une valeur pour toutes les périodes du calendrier, y compris futures. Le visual écarte les périodes de fin sans valeur ni indicateur de période courante, mais le plus propre est d'utiliser les textes statiques du panneau de format ou de conditionner la mesure (voir `mesures_exemple.dax`).
- **Colonnes texte dans un champ « mesure »** : vérifier l'agrégation *Premier* (et non *Nombre*).
- **Écarts en pourcentage** : formater la mesure en `%`, ou choisir *Display format = Percentage* (la valeur 0,062 devient 6.2%).

## 2. Panneau de format (11 cartes, 241 propriétés)

| Carte | Contenu |
|---|---|
| **Tile** | Mode responsive (auto / forcé), padding, fond et transparence, bordure, coins arrondis, ombre, avertissements de données |
| **Header** | Nom technique (texte, police, couleur, fond, bordure), catégorie (texte, police, couleur, style badge), titre (texte, police, alignement, nombre de lignes), sous-titre |
| **Main value** | Police, couleur, auto-size, texte « No data », format (hérité / nombre / pourcentage), unités (Auto, None, K, M, bn), décimales, séparateur de milliers, préfixe, suffixe ; valeur secondaire (libellé, unités, police, couleur) |
| **Target** | Affichage, libellé, unités, police, couleur, espacement, écart à la target (masqué par défaut) et son format |
| **Status badge** | Mode (Auto / Thresholds / Status Code), direction (Higher / Lower is better / Neutral), seuils, état « Above target » facultatif, badge « No target », forme ; pour chacun des 7 états : icône, texte, couleurs texte / fond / bordure |
| **Comparison 1 / 2** | Affichage, libellé et position du libellé, format (auto, %, absolu, texte préparé), décimales, signe +, flèche, position (à droite du badge / ligne dédiée), couleurs positive / négative / neutre, logique inversée |
| **Chart** | Périodes affichées (1–36, défaut 12), granularité, tri, période d'en-tête ; Grouped / Overlay, couleurs, espacement, largeur max, coins ; projection (couleur, motif hachuré / pointillé, contour) ; axe, quadrillage, libellés de période, étiquettes de données, indicateur « in progress », légende, légende de comptage ; noms des séries |
| **Details link** | Affichage, texte, police, couleur, soulignement au survol, largeur minimale, action |
| **Interaction** | Sélection des barres, multi-sélection, action du tile, URL statique, retour visuel au survol |
| **Accessibility** | Titre et description accessibles, navigation clavier, couleur du focus, contraste minimal imposé, réduction des animations |

Icônes embarquées (aucune ressource externe) : losange, cercle, carré, check, flèche montante, flèche descendante, avertissement, aucune.

### Statut : les deux modes

- **Thresholds** : `Status Value` (ex. écart relatif à la target) comparé à *On-target threshold* (défaut 0) et *Near-target threshold* (défaut −0,05). Seule la distance entre les deux seuils compte : la même règle fonctionne en *Higher is better* (≥ 0 On target ; −5 %…0 Near ; < −5 % Below) et en *Lower is better* (≤ 0 ; 0…5 % ; > 5 %). Sans `Status Value`, le visual déduit l'écart `(valeur − target) / |target|`.
- **Status Code** (recommandé pour les règles complexes) : le code vient de DAX ; `Status Label` remplace le texte. Un code inconnu est affiché tel quel dans le style neutre.

Seul le badge est coloré par le statut — jamais la valeur, le titre, le fond ou les barres.

## 3. Graphique

- **Grouped** (défaut) : barre N-1 claire + barre Actual foncée. **Overlay** : N-1 large en arrière-plan, Actual étroite devant.
- Période ouverte : Actual plein, Projection Remaining en gris **hachuré** avec **contour pointillé** (identifiable sans la couleur), libellé « in progress ».
- Projection < Actual : aucun segment, note « Projection is below actual » dans le tooltip. Période clôturée : jamais de segment.
- Libellés automatiques compacts (`Q3 '26`, `Nov`, année sous le premier mois et à chaque changement d'année) ; un libellé sur N quand la place manque, la période la plus récente étant toujours libellée. Pas de défilement horizontal.
- Valeurs négatives : barres sous une ligne de base à zéro.

## 4. Interactions

| Geste | Effet |
|---|---|
| Clic sur une barre | Sélectionne la période (filtre / surligne les autres visuels) ; second clic : désélectionne |
| Ctrl / Maj + clic | Multi-sélection (si activée) |
| Clic sur le fond du tile | Efface la sélection (ou action du tile si configurée) |
| Survol / focus clavier | Tooltip natif Power BI ; compatible *report page tooltips* |
| Clic droit | Menu contextuel Power BI (extraction, copie, exploration…) |
| Tab, ← →, Début, Fin, Entrée, Échap | Navigation clavier dans les barres, activation, effacement |

### Naviguer vers une page de détail

L'API des custom visuals ne permet pas de changer de page (voir `02-challenge-et-decisions.md`). Trois montages :

1. **Bouton Power BI transparent (recommandé, Desktop + Service)**. *Details action = None*. Insérer un bouton vide, le placer sur la zone `Details →`, *Action → Navigation dans les pages → Destination*, désactiver remplissage, contour et texte, le mettre au premier plan. La zone est **toujours dans le coin inférieur droit**, haute d'au moins 28 px, large d'au moins *Minimum width* (84 px par défaut), à une distance du bord égale au padding du tile (avec le réglage par défaut : 16 px de 400 à 599 px de large, 12 px sous 400 px, 8 px sous 260 px, 20 px à partir de 600 px) + la bordure. Pour une position identique sur toutes les tuiles, donner la même taille aux visuels ou forcer le mode dans *Tile → Responsive mode*. Elle ne bouge pas avec le nombre de barres. Ne couvrir que cette zone : un bouton sur tout le tile bloquerait tooltips et sélection.
2. **Extraction (drill-through) sans bouton**. *Details action = Open drill-through menu* : le clic ouvre le menu contextuel Power BI sur la période d'en-tête ; si une page d'extraction accepte le champ Period, l'entrée *Extraire* y mène. Un clic de plus, mais aucun objet superposé à maintenir.
3. **URL**. *Details action = Open URL* (ou *Tile action = Open URL*) avec `Action URL` ou l'URL statique. Seules les URL `http(s)` sont transmises à Power BI, qui demande confirmation à l'utilisateur. Une URL de page de rapport (`https://app.powerbi.com/groups/…/reports/…/ReportSection…`) s'ouvre alors dans le navigateur, hors du rapport courant.

### Power BI Embedded

*Tile action = Host event (Embedded)* (ou *Details action = Select period / host event*) déclenche une sélection Power BI ; l'application hôte la reçoit et navigue elle-même :

```js
report.on("dataSelected", async event => {
    const detail = event.detail;                       // { report, page, visual, filters, dataPoints }
    const isKpiTile = detail.visual && String(detail.visual.type || "").indexOf("kpiPerformanceTile") === 0;
    if (isKpiTile && detail.dataPoints && detail.dataPoints.length > 0) {
        await report.setPage("ReportSectionDetail");   // nom technique de la page de détail
    }
});
```

Le filtre sur `detail.visual` (type ou titre) est à ajuster à votre rapport ; à valider dans votre application.

## 5. Responsive

| Largeur | Mode | Comportement |
|---|---|---|
| < 260 px | Minimal | Sous-titre, catégorie, 2ᵉ comparaison, légende, étiquettes et comptage masqués ; nom technique, titre, valeur, badge et mini-tendance conservés |
| 260–399 px | Compact | Tout sauf légende et étiquettes de données ; zone Details maintenue |
| 400–599 px | Standard | Tous les composants, deux comparaisons, graphique complet |
| ≥ 600 px | Large | Espacement et graphique agrandis |

La valeur principale grandit continûment avec la largeur (auto-size) et rétrécit si elle ne tient pas. Quand la **hauteur** manque, les éléments sont masqués dans cet ordre jusqu'à ce que le graphique tienne : légende, étiquettes de données, sous-titre, comptage, « in progress », comparaison 2, libellés de période, valeur secondaire, target, catégorie, comparaison 1. Si le graphique ne peut pas tenir, il est retiré et les textes sont rétablis.

## 6. Accessibilité

Nom et description accessibles générés (KPI, valeur, période, target, statut, écarts) ; chaque barre est décrite ; focus visible ; un seul arrêt de tabulation pour le graphique ; mode **contraste élevé** de Windows / Power BI repris automatiquement (barres N-1 évidées, projection hachurée, badge bordé) ; statut porté par icône + texte, écarts par signe (flèche en option) ; couleurs par défaut à 4,5:1 minimum, option pour l'imposer aux couleurs personnalisées ; animations réduites si le système le demande.

## 7. Langue

Interface et libellés par défaut en anglais (V1). Tous les textes visibles du tile sont modifiables dans le panneau de format ou fournis par le modèle (titre, sous-titre, catégorie, libellés de comparaison, de statut et de valeur secondaire) — la table de traduction FR/NL du rapport peut donc déjà les alimenter. Les nombres suivent la langue de l'utilisateur Power BI (ex. `12,4K` et `12.000` en fr-BE).
