# Challenge du cahier des charges et décisions

Le cahier des charges est solide sur l'essentiel (rôles génériques, calculs dans DAX, navigation cadrée). Les points ci-dessous sont ceux où il était muet, contradictoire ou plus ambitieux que ce que Power BI permet. Chaque décision est réversible : la plupart sont un réglage du panneau de format.

## A. Points tranchés avec vous

| Sujet | Décision |
|---|---|
| Période qui alimente l'en-tête (non précisé dans le document) | Période marquée *Is Current Period*, sinon la plus récente. Réglable (*Header period*), avec une option « suit la barre sélectionnée » |
| Environnements | Power BI Desktop + Service. API 5.11. Report Server non visé |
| Distribution | Interne (import ou visuel d'organisation). Le code respecte quand même les règles de certification : aucun appel réseau, aucune ressource externe, pas d'`innerHTML`, privilèges vides, événements de rendu, menu contextuel |
| Métadonnées | Leyder Mathis, mathis.leyder@cm.be ; URL de support = `mailto:` faute de site |

## B. Ce que le document ne disait pas, et ce que j'ai retenu

1. **Une ligne par période, mais des valeurs « d'en-tête » uniques.** Target, comparaisons, statut, titre… sont des mesures évaluées pour *chaque* période. Le visual les lit sur la période d'en-tête ; les autres lignes servent aux tooltips des barres (target et écarts de la période survolée).
2. **Périodes futures.** Une mesure constante (target fixe, texte) existe pour tout le calendrier : sans précaution, « les X périodes les plus récentes » seraient des mois futurs vides. Le visual retire les périodes de fin qui n'ont ni valeur ni indicateur de période courante.
3. **Période ouverte sans `Is Current Period`.** Si le champ n'est pas fourni, la période la plus récente est considérée ouverte quand sa projection dépasse son réalisé. Avec le champ, seul lui décide (une période clôturée n'affiche jamais de projection, §13.4).
4. **Surlignage croisé.** Quand un autre visuel surligne, la tuile affiche les valeurs surlignées (en-tête compris) et garde la valeur totale en barre atténuée, comme les visuels natifs.
5. **Filtres de page.** « Les X périodes disponibles dans le contexte de filtre » : un segment sur un seul mois réduit donc l'historique à une barre. C'est le comportement demandé, mais il surprend ; le guide indique comment l'éviter (interactions du segment).
6. **`Target Variance`** : le §8.3 demande que l'écart vienne « de préférence d'une mesure », mais le §18 ne prévoit pas de rôle. Rôle ajouté ; à défaut le visual calcule un écart de présentation.
7. **Unités.** Valeur principale en unité automatique (`12.4K`), valeur secondaire et target en clair (`Actual: 9,875`, `Target 12,000`) par défaut : abréger les trois donnait des lignes incohérentes ou imprécises. Chacune a son réglage.
8. **Légende « 4 quarter pairs »** de la capture : générée automatiquement (`pairs` seulement si N-1 est affiché), remplaçable par un texte libre avec `{count}`.

## C. Contradictions du document

| Point | Problème | Décision |
|---|---|---|
| §17.1 « position / alignement » de la zone Details vs §17.3 « géométrie stable, coin inférieur droit » | Une position réglable casserait la superposition du bouton | Position fixe en bas à droite ; seule la largeur minimale est réglable |
| §16.3 valeur « Reserved for future native navigation » | Une option qui ne fait rien dans le panneau de format prête à confusion | Non exposée ; à ajouter le jour où l'API existe |
| §20 seuils responsive vs capture de référence | La capture (~370 px) est « compacte » selon le tableau, mais montre tout | Le mode compact conserve tous les composants de la capture ; seules la légende et les étiquettes de données sautent |
| §10.4 format « valeur et pourcentage » | Un seul champ valeur par comparaison | Passe par une mesure texte (`"+12 (+3.4%)"`), affichée telle quelle ; le signe du texte pilote la couleur |
| §9.4 « Good / Near / Bad threshold » | Trois seuils pour trois zones : l'un est redondant | Deux seuils (On target, Near target) ; « Below » est au-delà ; un seuil « Above target » facultatif |
| §19.1 « minimum visual size » | Un custom visual ne peut pas empêcher le redimensionnement | Dégradation progressive jusqu'aux très petites tailles au lieu d'un minimum imposé |

## D. Limites de Power BI (vérifiées)

- **Navigation entre pages** : confirmé, l'API des custom visuals n'expose toujours aucune méthode pour changer de page ou appliquer un signet (réponses Microsoft sur le forum Fabric et idée ouverte « Allow custom visuals to navigate between report pages », 2026). Les trois montages retenus (bouton transparent, menu d'extraction, URL) sont décrits dans le guide. J'ai ajouté le **menu d'extraction** (drill-through) depuis la zone Details, absent du cahier des charges : c'est la seule navigation native déclenchable par un visual.
- **Embedded** : l'événement `dataSelected` de `powerbi-client` remonte la sélection d'un visual à l'application, qui appelle `report.setPage()`.
- **Colonnes texte dans des champs mesure** : Power BI les agrège (Premier / Nombre). Les rôles texte sont déclarés « mesure » pour garder une ligne par période ; préférer des mesures.

## E. Écarts assumés par rapport au texte

- Alignement du nom technique (gauche) et de la catégorie (droite) non réglable : la ligne d'en-tête les oppose, comme sur la capture. Titre et sous-titre ont leur alignement.
- « Devise » (§7.4) : par le format de la mesure ou les champs Prefix / Suffix, pas de sélecteur de devise dédié.
- Avertissements de données (§23.8) : icône ⚠ discrète en bas à gauche avec le détail en infobulle, désactivable. L'icône d'avertissement native de l'en-tête Power BI n'est pas utilisée : je n'ai pas pu vérifier ici comment elle se retire une fois la donnée corrigée.
- Mise à jour partielle (§27) : un changement de sélection ne modifie que les barres ; les autres mises à jour reconstruisent la tuile (une centaine de nœuds).
- Localisation (§22.3, prévue « plus tard ») : l'infrastructure est déjà en place (clés + ressources `en-US` générées, gestionnaire de localisation du host). Seul l'anglais est livré.

## F. Point technique à connaître

`pbiviz package` échoue avec les outils 7.2.1 et `powerbi-visuals-utils-formattingutils` 7.0.0 quand il tente de retirer les langues inutilisées (erreur `Unexpected token 'export'` dans `localizationLoader`). Le script `npm run package` utilise donc `--all-locales` : toutes les cultures de formatage sont embarquées (le `.pbiviz` pèse environ 150 Ko), ce qui est de toute façon souhaitable pour des utilisateurs FR/NL. À retirer quand l'outil sera corrigé.

`tsconfig.json` laisse `strictNullChecks` désactivé pour la même raison d'outillage (le fichier généré par `pbiviz` ne compile pas en mode strict) ; le contrôle strict complet passe par `npm run check`.

## G. Suggestions pour la V1.1

1. Recette dans Power BI Desktop / Service (non réalisable ici) puis correction des écarts éventuels.
2. Ressources FR / NL du panneau de format.
3. Mise en forme conditionnelle (`fx`) sur les couleurs du badge, si certains KPI veulent piloter les couleurs depuis DAX.
4. Ligne de target dans le mini-graphique (une mesure par période existe déjà).
5. Fichier `.pbip` d'exemple versionné avec les trois tuiles RET-001 / 002 / 003.
