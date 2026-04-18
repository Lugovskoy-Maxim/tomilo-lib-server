import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Документ конфигурации системы дисциплин
 */
export type DisciplesConfigDocument = DisciplesConfig & Document;

/**
 * Схема конфигурации дисциплин
 *
 * Содержит все настройки, влияющие на игровой процесс, баланс и механики.
 * Один документ с id='default' используется в системе.
 */
@Schema({ timestamps: true, _id: true })
export class DisciplesConfig {
  _id!: Types.ObjectId;

  /**
   * Уникальный идентификатор конфигурации
   * Должен быть 'default' для единственного документа конфига
   */
  @Prop({ required: true, unique: true, default: 'default' })
  id!: string;

  // ==================== БАЗОВЫЕ НАСТРОЙКИ ====================

  /**
   * Стоимость реролла кандидата в монетах
   * Цена, которую платит игрок для получения нового кандидата на призыв
   */
  @Prop({ required: true })
  rerollCostCoins!: number;

  /**
   * Стоимость тренировки дисциплина в монетах
   * Цена, которую платит игрок за ежедневную тренировку
   */
  @Prop({ required: true })
  trainCostCoins!: number;

  /**
   * Максимальное количество активных дисциплин
   * Количество дисциплин, которые могут находиться в активном отряде
   */
  @Prop({ default: 3 })
  maxDisciples!: number;

  /**
   * Максимальное количество боев в день
   * Ограничение на количество обычных боев для обычных пользователей
   */
  @Prop({ default: 5 })
  maxBattlesPerDay!: number;

  // ==================== СТАТИСТИКИ И РАНГИ ====================

  /**
   * Диапазоны базовых статов при найме дисциплина
   * Определяет минимальные и максимальные значения статов при создании нового дисциплина
   */
  @Prop({
    type: {
      attackMin: { type: Number, default: 5 },
      attackMax: { type: Number, default: 15 },
      defenseMin: { type: Number, default: 5 },
      defenseMax: { type: Number, default: 15 },
      speedMin: { type: Number, default: 3 },
      speedMax: { type: Number, default: 12 },
      hpMin: { type: Number, default: 20 },
      hpMax: { type: Number, default: 50 },
    },
    default: () => ({
      attackMin: 5,
      attackMax: 15,
      defenseMin: 5,
      defenseMax: 15,
      speedMin: 3,
      speedMax: 12,
      hpMin: 20,
      hpMax: 50,
    }),
  })
  statRanges!: {
    attackMin: number;
    attackMax: number;
    defenseMin: number;
    defenseMax: number;
    speedMin: number;
    speedMax: number;
    hpMin: number;
    hpMax: number;
  };

  /**
   * Коэффициенты формулы расчета Combat Power (CP)
   * CP = attack*k1 + defense*k2 + speed*k3 + hp*k4
   * Влияет на силу дисциплина в бою и рейтинг
   */
  @Prop({
    type: {
      attack: { type: Number, default: 1.2 },
      defense: { type: Number, default: 1.0 },
      speed: { type: Number, default: 0.8 },
      hp: { type: Number, default: 0.3 },
    },
    default: () => ({ attack: 1.2, defense: 1.0, speed: 0.8, hp: 0.3 }),
  })
  cpFormula!: { attack: number; defense: number; speed: number; hp: number };

  /**
   * Коэффициент для расчета шанса победы
   * Формула: 0.5 + k * (CP_A - CP_B) / (CP_A + CP_B)
   * Более высокое значение увеличивает влияние разницы CP на шанс победы
   */
  @Prop({ default: 0.3 })
  winChanceK!: number;

  /**
   * Максимальное значение статов после тренировок (лимит)
   * Превышение этого значения невозможно, даже если игрок продолжает тренировки
   */
  @Prop({ default: 50 })
  statCap!: number;

  /**
   * Шанс провала тренировки
   * Вероятность, что тренировка не повысит статы (только стоимость и слот тренировки теряются)
   * Диапазон: 0-1, где 0 - никогда не проваливается, 1 - всегда проваливается
   */
  @Prop({ default: 0.03 })
  trainFailChance!: number;

  // ==================== СИСТЕМА ПРИЗЫВА ====================

  /**
   * Время жизни кандидата реролла в минутах
   * Время, в течение которого игрок может нанять кандидата после реролла
   * По истечении времени кандидат исчезает
   */
  @Prop({ default: 60 * 24 * 7 }) // 7 дней по умолчанию
  rerollCandidateTtlMinutes!: number;

  /**
   * Пул персонажей для реролла
   * 'all' - все персонажи, 'bookmarks' - только из закладок пользователя
   * Влияет на доступных для призыва персонажей
   */
  @Prop({ default: 'all' })
  characterPool!: 'all' | 'bookmarks';

  /**
   * Бонус к статам для главных героев при найме
   * Дополнительные очки, добавляемые к базовым статам персонажей с ролью "главный герой"
   */
  @Prop({ default: 3 })
  recruitMainHeroBonus!: number;

  /**
   * Бонус к здоровью для главных героев при найме
   * Дополнительные очки здоровья, добавляемые к базовому HP главных героев
   */
  @Prop({ default: 5 })
  recruitMainHeroHpBonus!: number;

  // ==================== НЕДЕЛЬНЫЕ СХВАТКИ ====================

  /**
   * Награда в монетах за победу в недельной схватке
   */
  @Prop({ default: 400 })
  weeklyBattleCoinsWin!: number;

  /**
   * Награда в монетах за поражение в недельной схватке
   */
  @Prop({ default: 20 })
  weeklyBattleCoinsLoss!: number;

  /**
   * Коэффициент изменения рейтинга за победу/поражение (система Эло)
   * Определяет, насколько сильно меняется рейтинг после боя
   * Более высокое значение - более резкие изменения рейтинга
   */
  @Prop({ default: 25 })
  weeklyRatingK!: number;

  /**
   * Базовый рейтинг для новых игроков
   * Начальный рейтинг при первом участии в недельных схватках
   */
  @Prop({ default: 1000 })
  weeklyRatingBase!: number;

  /**
   * Максимальное количество недельных боев
   * Количество недельных боев, которые игрок может провести за неделю
   */
  @Prop({ default: 1 })
  maxWeeklyBattles!: number;

  // ==================== ЭКСПЕДИЦИИ ====================

  /**
   * Время восстановления экспедиций в часах
   * Время, которое должно пройти между экспедициями
   */
  @Prop({ default: 24 })
  expeditionCooldownHours!: number;

  /**
   * Стоимость монет на простую экспедицию
   */
  @Prop({ default: 20 })
  expeditionCostCoinsEasy!: number;

  /**
   * Стоимость монет на нормальную экспедицию
   */
  @Prop({ default: 50 })
  expeditionCostCoinsNormal!: number;

  /**
   * Стоимость монет на сложную экспедицию
   */
  @Prop({ default: 150 })
  expeditionCostCoinsHard!: number;

  /**
   * Базовый шанс успеха простой экспедиции
   * Диапазон: 0-1, где 0 - никогда не удается, 1 - всегда удается
   */
  @Prop({ default: 0.9 })
  expeditionSuccessChanceEasy!: number;

  /**
   * Базовый шанс успеха нормальной экспедиции
   */
  @Prop({ default: 0.75 })
  expeditionSuccessChanceNormal!: number;

  /**
   * Базовый шанс успеха сложной экспедиции
   */
  @Prop({ default: 0.55 })
  expeditionSuccessChanceHard!: number;

  /**
   * Бонус к шансу успеха экспедиции за уровень
   * Дополнительный шанс успеха за каждый уровень дисциплина
   * Например, 0.01 означает +1% к шансу успеха за каждый уровень
   */
  @Prop({ default: 0.01 })
  expeditionLevelBonusChance!: number;

  /**
   * Максимальный бонус к шансу успеха от уровня
   * Ограничивает максимальное значение бонуса от уровня
   */
  @Prop({ default: 0.15 })
  expeditionMaxLevelBonusChance!: number;

  /**
   * Шанс засады во время экспедиции
   * Если засада происходит, игрок теряет часть добычи
   */
  @Prop({ default: 0.12 })
  expeditionAmbushChance!: number;

  /**
   * Множитель награды за успех в простой экспедиции
   * Количество монет, получаемых за успешную простую экспедицию
   */
  @Prop({ default: 35 })
  expeditionRewardCoinsEasy!: number;

  /**
   * Множитель награды за успех в нормальной экспедиции
   */
  @Prop({ default: 70 })
  expeditionRewardCoinsNormal!: number;

  /**
   * Множитель награды за успех в сложной экспедиции
   */
  @Prop({ default: 120 })
  expeditionRewardCoinsHard!: number;

  /**
   * Множитель награды за провал простой экспедиции
   * Количество монет, получаемых даже при провале простой экспедиции
   */
  @Prop({ default: 8 })
  expeditionFailRewardCoinsEasy!: number;

  /**
   * Множитель награды за провал нормальной экспедиции
   */
  @Prop({ default: 15 })
  expeditionFailRewardCoinsNormal!: number;

  /**
   * Множитель награды за провал сложной экспедиции
   */
  @Prop({ default: 25 })
  expeditionFailRewardCoinsHard!: number;

  /**
   * Опыт за успех в простой экспедиции
   */
  @Prop({ default: 10 })
  expeditionSuccessExpEasy!: number;

  /**
   * Опыт за успех в нормальной экспедиции
   */
  @Prop({ default: 20 })
  expeditionSuccessExpNormal!: number;

  /**
   * Опыт за успех в сложной экспедиции
   */
  @Prop({ default: 35 })
  expeditionSuccessExpHard!: number;

  /**
   * Опыт за провал простой экспедиции
   */
  @Prop({ default: 4 })
  expeditionFailExpEasy!: number;

  /**
   * Опыт за провал нормальной экспедиции
   */
  @Prop({ default: 8 })
  expeditionFailExpNormal!: number;

  /**
   * Опыт за провал сложной экспедиции
   */
  @Prop({ default: 12 })
  expeditionFailExpHard!: number;

  /**
   * Длительность простой экспедиции в секундах
   * Время, которое проходит перед завершением простой экспедиции
   */
  @Prop({ default: 40 })
  expeditionDurationEasy!: number;

  /**
   * Длительность нормальной экспедиции в секундах
   */
  @Prop({ default: 67.5 })
  expeditionDurationNormal!: number;

  /**
   * Длительность сложной экспедиции в секундах
   */
  @Prop({ default: 90 })
  expeditionDurationHard!: number;

  // ==================== СИНТЕЗ ПРЕДМЕТОВ ====================

  /**
   * Количество осколков, необходимых для создания стабилизатора алхимии
   */
  @Prop({ default: 3 })
  fragmentsForStabilizer!: number;

  /**
   * Количество базовых талисманов, необходимых для создания талисмана защиты
   */
  @Prop({ default: 2 })
  basicTalismansForDefense!: number;

  /**
   * Количество осколков и базовых талисманов для создания талисмана вылазки
   */
  @Prop({ default: 2 })
  fragmentsForExpeditionTalisman!: number;

  @Prop({ default: 1 })
  basicTalismansForExpeditionTalisman!: number;

  /**
   * Количество пилюль исцеления и базовых талисманов для создания талисмана небесной грозы
   */
  @Prop({ default: 4 })
  healingPillsForThunderTalisman!: number;

  @Prop({ default: 1 })
  basicTalismansForThunderTalisman!: number;

  // ==================== БИБЛИОТЕКА И ОПЫТ ====================

  /**
   * Базовый опыт, необходимый для следующего уровня ученика
   * Начальное значение для формулы роста опыта
   */
  @Prop({ default: 36 })
  baseExpToNextLevel!: number;

  /**
   * Множитель роста опыта для следующего уровня ученика
   * Коэффициент, определяющий, как быстро растет требуемый опыт
   */
  @Prop({ default: 22 })
  expGrowthMultiplier!: number;

  /**
   * Квадратичный множитель роста опыта для следующего уровня ученика
   * Дополнительный коэффициент, делающий рост опыта квадратичным
   */
  @Prop({ default: 0.14 })
  expGrowthQuadratic!: number;

  /**
   * Минимальный опыт для следующего уровня ученика
   * Гарантированное минимальное значение, даже если формула дает меньше
   */
  @Prop({ default: 32 })
  minExpToNextLevel!: number;

  /**
   * Базовый опыт для следующего уровня библиотеки
   */
  @Prop({ default: 32 })
  baseLibraryExpToNext!: number;

  /**
   * Множитель роста опыта для следующего уровня библиотеки
   */
  @Prop({ default: 20 })
  libraryExpGrowthMultiplier!: number;

  /**
   * Квадратичный множитель роста опыта для следующего уровня библиотеки
   */
  @Prop({ default: 0.1 })
  libraryExpGrowthQuadratic!: number;

  /**
   * Минимальный опыт для следующего уровня библиотеки
   */
  @Prop({ default: 28 })
  minLibraryExpToNext!: number;

  /**
   * Опыт для изучения техники в библиотеке
   * Количество опыта, добавляемого при изучении новой техники
   */
  @Prop({ default: 4 })
  learnTechniqueLibraryExp!: number;

  // ==================== БОЕВАЯ СИСТЕМА ====================

  /**
   * Доля опыта основного ученика при тренировке
   * Процент опыта, который получает основной ученик, остальное делится между остальными
   */
  @Prop({ default: 0.42 })
  trainingPrimaryExpShare!: number;

  /**
   * Доля опыта основного ученика в боях, экспедициях и колесе
   * Процент опыта, который получает основной ученик в боевых ситуациях
   */
  @Prop({ default: 0.55 })
  battlePrimaryExpShare!: number;

  /**
   * Максимальное количество ходов в бою
   * Ограничивает количество раундов в бою
   */
  @Prop({ default: 30 })
  maxBattleTurns!: number;

  /**
   * Базовая мощность атаки в бою
   * Влияет на расчет урона от обычных атак
   */
  @Prop({ default: 10 })
  baseAttackPower!: number;

  /**
   * Множитель атаки при расчете урона
   * Коэффициент, определяющий влияние атаки на наносимый урон
   */
  @Prop({ default: 0.46 })
  attackDamageMultiplier!: number;

  /**
   * Множитель скорости при расчете урона
   * Коэффициент, определяющий влияние скорости на наносимый урон
   */
  @Prop({ default: 0.16 })
  speedDamageMultiplier!: number;

  /**
   * Множитель защиты при расчете сопротивления урону
   * Коэффициент, определяющий влияние защиты на получаемый урон
   */
  @Prop({ default: 0.5 })
  defenseDamageReduction!: number;

  /**
   * Множитель скорости при расчете сопротивления урону
   * Коэффициент, определяющий влияние скорости на получаемый урон
   */
  @Prop({ default: 0.32 })
  speedDamageReduction!: number;

  /**
   * Минимальный урон от атаки
   * Гарантированный минимум урона, даже если расчет дает меньше
   */
  @Prop({ default: 2 })
  minDamage!: number;

  /**
   * Базовая эффективность щита от баффов
   * Коэффициент, определяющий эффективность щитов от защитных техник
   */
  @Prop({ default: 2.1 })
  shieldEffectiveness!: number;

  /**
   * Множитель защиты при расчете щита
   * Коэффициент, определяющий влияние защиты на размер щита
   */
  @Prop({ default: 0.55 })
  defenseShieldMultiplier!: number;

  /**
   * Множитель скорости при расчете щита
   * Коэффициент, определяющий влияние скорости на размер щита
   */
  @Prop({ default: 0.22 })
  speedShieldMultiplier!: number;

  /**
   * Минимальный размер щита
   * Гарантированный минимум щита, даже если расчет дает меньше
   */
  @Prop({ default: 6 })
  minShield!: number;

  /**
   * Эффективность уклонения
   * Процент урона, блокируемого при уклонении (0.5 = 50%)
   */
  @Prop({ default: 0.52 })
  dodgeEffectiveness!: number;

  // ==================== СИНХРОНИЯ ОТРЯДА ====================

  /**
   * Требуемое количество активных дисциплин для проверки синергии отряда
   * Обычно 3, но может быть изменено для баланса
   */
  @Prop({ default: 3 })
  squadSynergyRosterSize!: number;

  /**
   * Множитель синергии для отряда из одного тайтла
   * Увеличивает все статы, когда все дисциплины из одного тайтла
   */
  @Prop({ default: 1.06 })
  synergySameTitle!: number;

  /**
   * Множитель синергии для отряда из антагонистов
   * Увеличивает атаку и скорость для отряда из антагонистов
   */
  @Prop({ default: 1.1 })
  synergyAllAntagonistAttack!: number;

  @Prop({ default: 1.08 })
  synergyAllAntagonistSpeed!: number;

  @Prop({ default: 1.04 })
  synergyAllAntagonistDefense!: number;

  @Prop({ default: 1.03 })
  synergyAllAntagonistHp!: number;

  /**
   * Множитель синергии для отряда из главных героев
   * Сбалансированное усиление для отряда из главных героев
   */
  @Prop({ default: 1.05 })
  synergyAllMainAttack!: number;

  @Prop({ default: 1.05 })
  synergyAllMainDefense!: number;

  @Prop({ default: 1.05 })
  synergyAllMainSpeed!: number;

  @Prop({ default: 1.08 })
  synergyAllMainHp!: number;

  // ==================== МАГАЗИН ДИСЦИПЛОВ ====================

  /**
   * Цена свитка знаний (опыт библиотеки) в монетах
   */
  @Prop({ default: 130 })
  libraryScrollPrice!: number;

  /**
   * Количество опыта библиотеки, получаемое за свиток знаний
   */
  @Prop({ default: 45 })
  libraryScrollExp!: number;

  /**
   * Цена стабилизатора алхимии ×2 в монетах
   */
  @Prop({ default: 70 })
  stabilizer2Price!: number;

  /**
   * Цена загадочных осколков ×2 в монетах
   */
  @Prop({ default: 100 })
  fragment2Price!: number;

  /**
   * Цена пилюль исцеления ×4 в монетах
   */
  @Prop({ default: 55 })
  healingPill4Price!: number;

  /**
   * Цена базовых талисманов ×2 в монетах
   */
  @Prop({ default: 48 })
  basicTalisman2Price!: number;

  /**
   * Цена талисмана защиты ×1 в монетах
   */
  @Prop({ default: 65 })
  defenseTalisman1Price!: number;

  /**
   * Цена талисмана небесной грозы ×1 в монетах
   */
  @Prop({ default: 95 })
  heavenlyThunder1Price!: number;

  /**
   * Цена осколка воскрешения ×1 в монетах
   */
  @Prop({ default: 120 })
  resurrectionFragment1Price!: number;

  /**
   * Цена талисмана вылазки ×1 в монетах
   */
  @Prop({ default: 85 })
  expeditionTalisman1Price!: number;
}

export const DisciplesConfigSchema =
  SchemaFactory.createForClass(DisciplesConfig);
