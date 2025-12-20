<h1>
  HTML <img src="./assets/html.svg" width="40" height="40" alt="HTML logo"/>
</h1>

<h2>Найпопулярніші запитання та відповіді на співбесіді з HTML</h2>

<details>
<summary>1. Що означає абревіатура HTML і яке її призначення?</summary>

#### HTML

- HTML — HyperText Markup Language, мова розмітки для структурування вмісту
  вебсторінок (текст, зображення, посилання тощо).

- Призначення — описувати структуру та семантику контенту, який браузер
  відображає користувачу.

</details>

<details>
<summary>2. Чим HTML відрізняється від CSS та JavaScript?</summary>

#### HTML

- **HTML** — описує структуру веб-сторінки (що є: заголовки, абзаци, зображення,
  посилання).

- **CSS** — відповідає за оформлення і стиль (як виглядає: кольори, шрифти,
  розташування).

- **JavaScript** — додає динаміку та інтерактивність (що робить: обробка подій,
  зміна DOM, анімації, логіка).

Разом вони формують основу фронтенд-розробки: HTML — кістяк, CSS — одяг,
JavaScript — поведінка.

</details>

<details>
<summary>3. Що таке HTML теги?</summary>

#### HTML

- HTML теги — це інструкції (команди), які визначають структуру та зміст
  веб-сторінки.

- Теги пишуться у кутових дужках `< >`.

- Більшість тегів мають відкриваючу та закриваючу частини:

  ```html
  <p>Текст абзацу</p>
  ```

- Деякі теги самозакриваючі:

  ```html
  <br />
  <img src="image.jpg" alt="Зображення" />
  ```

- Теги можуть мати атрибути для додаткової інформації:
  ```html
  <a href="https://example.com">Посилання</a>
  ```

</details>

<details>
<summary>4. Що таке HTML елементи?</summary>

#### HTML

HTML елемент — це повна конструкція, що складається з відкриваючого тега,
контенту та закриваючого тега.

#### Структура елемента:

```html
<tagname attribute="value">контент</tagname>
```

#### Приклади:

- `<h1>Заголовок</h1>` — елемент заголовка
- `<p>Абзац тексту</p>` — елемент абзацу
- `<img src="photo.jpg" alt="Фото">` — елемент зображення (самозакриваючий)

Елементи можуть містити інші елементи (вкладеність) і мати атрибути для
додаткових налаштувань.

</details>

<details>
<summary>5. Опишіть базову структуру HTML-сторінки?</summary>

#### HTML

**Основна структура HTML-документа:**

```html
<!DOCTYPE html>
<!-- Оголошення типу документа -->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Назва сторінки</title>
  </head>
  <body>
    <!-- Вміст сторінки -->
  </body>
</html>
```

**Складові:**

1. `<!DOCTYPE html>` — вказує, що документ у HTML5.

2. `<html>` — кореневий елемент.

3. `<head>` — метадані (кодова сторінка, заголовок, стилі, скрипти).

4. `<body>` — видимий вміст сторінки.

</details>

<details>
<summary>6. Що таке DOCTYPE і навіщо його використовують?</summary>

#### HTML

`DOCTYPE` (Document Type Declaration) — це декларація типу документа, яка
повідомляє браузеру, яку версію HTML використовує сторінка.

#### Синтаксис для HTML5:

```html
<!DOCTYPE html>
```

#### Призначення:

- Запобігає режиму сумісності (quirks mode) браузера
- Забезпечує коректне відображення сторінки згідно зі стандартами
- Допомагає валідаторам перевіряти правильність коду
- Має стояти першим рядком HTML-документа

</details>

<details>
<summary>7. Яка поточна версія HTML?</summary>

#### HTML

- Поточна версія — **HTML5**.

- HTML5 є `Living Standard` (живий стандарт), що означає постійне оновлення без
  формальних нових версій.

- Підтримується всіма сучасними браузерами.

- Включає нові семантичні елементи, API, покращену підтримку мультимедіа та
  багато інших функцій.

- Розробляється консорціумом WHATWG (Web Hypertext Application Technology
  Working Group).

</details>

<details>
<summary>8. Що роблять атрибути DOCTYPE та html lang?</summary>

#### HTML

- `<!DOCTYPE html>` — повідомляє браузеру, що документ написаний у стандарті
  HTML5, щоб уникнути режиму сумісності.

- `lang` у `<html>` — вказує мову вмісту сторінки для пошукових систем, читачів
  екрану та інших сервісів (наприклад, lang="uk").

#### Приклад:

```html
<!DOCTYPE html>
<html lang="uk">
  <!-- Решта документа -->
</html>
```

Ці атрибути покращують доступність, SEO та коректність відображення сторінки.

</details>

<details>
<summary>9. Що описується в тегі head?</summary>

#### HTML

Тег `<head>` містить метаінформацію про документ:

1. **Назва сторінки** — `<title>`.
2. **Мета-теги** — `<meta>` (характеристики документа, ключові слова, опис).
3. **Підключення стилів** — `<link>` (CSS-файли).
4. **Скрипти** — `<script>` (підключення JavaScript).
5. **Фавікон** — `<link>` для іконки сайту.
6. **Інші налаштування** — наприклад, `<base>` для базового URL.

#### Приклад:

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Назва сторінки</title>
  <link rel="stylesheet" href="styles.css" />
  <script src="script.js"></script>
</head>
```

</details>

<details>
<summary>10. Яка різниця між тегами head та body?</summary>

#### HTML

- `<head>` — містить метадані про документ (назва, кодування, стилі, скрипти,
  SEO-теги), не відображається безпосередньо на сторінці.

- `<body>` — містить видимий контент для користувача (текст, зображення, кнопки,
  відео тощо).

#### Ключові відмінності:

**`<head>`:**

- Невидимий для користувача
- Містить службову інформацію
- Налаштування сторінки
- SEO-дані

**`<body>`:**

- Видимий контент
- Те, що бачить користувач
- Інтерактивні елементи
- Основний вміст сторінки

</details>

<details>
<summary>11. Що таке пробільний простір в HTML?</summary>

#### HTML

Пробільний простір в HTML — це пробіли, табуляції та переноси рядків між
елементами.

#### Поведінка браузера:

- Браузер автоматично **згортає** (схлопує) декілька пробілів в один
- Кілька переносів рядків замінюються одним пробілом
- Провідні та кінцеві пробіли ігноруються

#### Приклад:

```html
<p>Цей текст має багато пробілів</p>
```

Відображається як: `Цей текст має багато пробілів`

Для збереження пробілів використовуйте CSS `white-space: pre` або тег `<pre>`

</details>

<details>
<summary>12. Що таке порожні елементи в HTML?</summary>

#### HTML

Порожні елементи (void elements) — це HTML теги, які не мають контенту і
закриваючого тега.

#### Основні порожні елементи:

- `<br>` — розрив рядка
- `<hr>` — горизонтальна лінія
- `<img>` — зображення
- `<input>` — поле вводу
- `<meta>` — метадані
- `<link>` — посилання на ресурс

#### Синтаксис:

```html
<!-- Правильно -->
<img src="photo.jpg" alt="Фото" />
<br />
<input type="text" name="name" />

<!-- В XHTML/XML стилі (необов'язково в HTML5) -->
<img src="photo.jpg" alt="Фото" />
<br />
```

</details>

<details>
<summary>13. У чому різниця між елементами div і span?</summary>

#### HTML

#### `<div>` (блоковий елемент):

- Займає всю доступну ширину
- Починається з нового рядка
- Має верхні та нижні відступи
- Використовується для великих блоків контенту

#### `<span>` (вбудований елемент):

- Займає тільки необхідну ширину
- Не переносить на новий рядок
- Не має вертикальних відступів
- Використовується для маленьких фрагментів тексту

#### Приклад:

```html
<div>Це блоковий елемент</div>
<div>Він займає всю ширину</div>

<p>Це <span>вбудований елемент</span> всередині абзацу.</p>
```

</details>

<details>
<summary>14. Яка різниця між тегами b та strong?</summary>

#### HTML

- `<b>` — просто робить текст візуально жирним, без додаткового смислового
  значення.

- `<strong>` — робить текст жирним і додає семантичний акцент (важливість), що
  враховується пошуковими системами та скрінрідерами.

#### Приклади:

```html
<p>Цей текст <b>жирний</b> тільки візуально.</p>
<p>Цей текст <strong>важливий</strong> за змістом.</p>
```

**Рекомендація:** Використовуйте `<strong>` для смислово важливого тексту, `<b>`
— тільки для стилізації без семантичного значення.

</details>

<details>
<summary>15. Коли слід використовувати em замість i, і навпаки?</summary>

#### HTML

- `<em>` — виділяє текст курсивом з семантичним наголосом (інтонаційне чи
  логічне підкреслення важливості).

- `<i>` — відображає текст курсивом без зміни смислу (наприклад, іноземні слова,
  технічні терміни, назви).

#### Приклади:

```html
<!-- Семантичний наголос -->
<p>Я <em>дуже</em> хочу це зробити!</p>

<!-- Стилістичне виділення -->
<p>Фільм <i>Титанік</i> вийшов в 1997 році.</p>
<p>Слово <i>bonjour</i> означає "привіт" французькою.</p>
```

Якщо потрібно передати смисловий акцент — використовуємо `<em>`. Якщо тільки
стиль відображення — `<i>`.

</details>

<details>
<summary>16. Яке призначення тегів small, s та mark?</summary>

#### HTML

- `<small>` — робить текст меншим і семантично позначає додаткову або другорядну
  інформацію (примітки, дисклеймери).

- `<s>` — відображає текст закресленим, коли він втратив актуальність, але його
  варто залишити для перегляду.

- `<mark>` — виділяє текст жовтим фоном для підсвічування важливого або
  знайденого фрагмента.

#### Приклади:

```html
<p>Ціна: <s>100 грн</s> 80 грн</p>
<p><mark>Важливо:</mark> Термін дії до 31 грудня.</p>
<p>Основний текст. <small>© 2023 Всі права захищені.</small></p>
```

</details>

<details>
<summary>17. Як створити абзац або розрив рядка в HTML?</summary>

#### HTML

**Абзац:**

```html
<p>Текст абзацу</p>
```

створює блок з відступами зверху і знизу.

**Розрив рядка:**

```html
Текст першого рядка<br />Текст другого рядка
```

переносить текст без створення нового абзацу.

#### Коли використовувати:

- `<p>` — для окремих абзаців тексту
- `<br>` — для примусового переносу в межах одного блоку (адреси, вірші)

</details>

<details>
<summary>18. Для чого використовуються теги sub та sup?</summary>

#### HTML

- `<sub>` — підрядковий текст (нижче базової лінії)
- `<sup>` — надрядковий текст (вище базової лінії)

#### Використання:

**Математичні формули:**

```html
<p>H<sub>2</sub>O - формула води</p>
<p>E = mc<sup>2</sup> - формула Ейнштейна</p>
```

**Хімічні формули:**

```html
<p>CO<sub>2</sub> - вуглекислий газ</p>
```

**Сноски:**

```html
<p>Цей факт<sup>1</sup> потребує підтвердження.</p>
```

</details>

<details>
<summary>19. Розкажіть про тег samp?</summary>

#### HTML

Тег `<samp>` використовується для позначення тексту, який є результатом
виконання комп'ютерної програми, наприклад, повідомлень про помилки або вихідних
даних. Він відображається звичайним шрифтом, але зазвичай використовується для
стилістичних цілей.

Приклад використання тегу `<samp>`:

```html
<p>Результат виконання програми: <samp>Помилка: Невірний ввід</samp></p>
<p>Командний рядок повернув: <samp>Hello World!</samp></p>
```

**Пов'язані теги:**

- `<code>` — для фрагментів коду
- `<kbd>` — для клавіш клавіатури
- `<var>` — для змінних

</details>

<details>
<summary>20. Які глобальні атрибути є в HTML?</summary>

#### HTML

Глобальні атрибути можна використовувати з будь-яким HTML елементом:

#### Основні глобальні атрибути:

- `id` — унікальний ідентифікатор елемента
- `class` — CSS класи для стилізації
- `style` — вбудовані стилі CSS
- `title` — підказка при наведенні
- `lang` — мова контенту
- `dir` — напрям тексту (ltr/rtl)
- `tabindex` — порядок фокусування
- `hidden` — приховує елемент
- `data-*` — користувацькі атрибути

#### Атрибути подій:

- `onclick`, `onmouseover`, `onload` тощо

#### Приклад:

```html
<div
  id="main-content"
  class="container highlight"
  title="Основний контент сторінки"
  lang="uk"
  data-section="hero"
>
  Контент...
</div>
```

</details>

<details>
<summary>21. Як використовують атрибути class та id? Яка різниця між класами та ідентифікаторами?</summary>

#### HTML

#### Атрибут `id`:

- Унікальний ідентифікатор елемента на сторінці
- Може бути тільки один елемент з конкретним id
- Використовується для JavaScript, якірних посилань, CSS стилізації

#### Атрибут `class`:

- Групує елементи за спільними характеристиками
- Один клас можна застосувати до багатьох елементів
- Один елемент може мати кілька класів

#### Приклади:

```html
<!-- ID - унікальний -->
<div id="header">Заголовок сайту</div>
<div id="navigation">Навігація</div>

<!-- Class - може повторюватися -->
<p class="highlight">Важливий текст</p>
<p class="highlight large">Великий важливий текст</p>
<span class="highlight">Ще важливий текст</span>
```

#### CSS селектори:

```css
#header {
  color: blue;
} /* ID селектор */
.highlight {
  color: red;
} /* Class селектор */
```

**Рекомендація:** Використовуйте `id` для унікальних елементів і якірних
посилань, `class` — для стилізації та групування.

</details>

<details>
<summary>22. Яке призначення атрибута alt в HTML?</summary>

#### HTML

- `alt` — альтернативний текст для зображення.

#### Призначення:

- Показується, якщо зображення не завантажилось.

- Допомагає скрінрідерам робити сайт доступним.

- Використовується для SEO.

#### Приклади:

```html
<!-- Інформативне зображення -->
<img src="chart.png" alt="Графік продажів за 2023 рік" />

<!-- Декоративне зображення -->
<img src="decoration.png" alt="" />

<!-- Зображення-посилання -->
<a href="/home">
  <img src="logo.png" alt="Повернутися на головну сторінку" />
</a>
```

**Важливо:** Для декоративних зображень використовуйте порожній `alt=""`, щоб
скрін-рідери їх ігнорували.

</details>

<details>
<summary>23. Навіщо використовується тег label?</summary>

#### HTML

`<label>` пов'язує текстову підказку з елементом форми, щоб користувачу було
зрозуміло, що вводити.

#### Переваги:

- Покращує доступність (скрінрідери читають підказку разом із полем).

- Клік по <label> автоматично фокусує пов'язане поле.

#### Приклади:

**Зовнішній label (через атрибути for та id):**

```html
<label for="email">Email:</label> <input type="email" id="email" name="email" />
```

**Внутрішній label (обгортає елемент):**

```html
<label>
  <input type="checkbox" name="agree" />
  Погоджуюсь з умовами
</label>
```

**Для групи radio buttons:**

```html
<label for="size-small">
  <input type="radio" id="size-small" name="size" value="small" />
  Малий
</label>
<label for="size-large">
  <input type="radio" id="size-large" name="size" value="large" />
  Великий
</label>
```

</details>

<details>
<summary>24. Що таке атрибути data-* і коли їх слід використовувати?</summary>

#### HTML

- `data-*` — це користувацькі атрибути для зберігання будь-яких додаткових даних
  у елементі HTML.

#### Синтаксис:

```html
<div data-user-id="123" data-role="admin" data-last-login="2023-12-01"></div>
```

#### Коли використовувати:

- Зберігати інформацію для JavaScript без впливу на відображення.

- Легко отримувати через element.dataset.userId або element.dataset.role.

- Наприклад, для інтерактивних елементів, налаштувань чи передачі даних у JS.

#### Приклад використання з JavaScript:

```html
<button data-action="delete" data-id="42">Видалити</button>

<script>
  const button = document.querySelector('button');
  console.log(button.dataset.action); // "delete"
  console.log(button.dataset.id); // "42"
</script>
```

</details>

<details>
<summary>25. Що таке data-атрибути, в яких випадках їх використовуєте?</summary>

#### HTML

`data-*` атрибути дозволяють зберігати користувацькі дані прямо в HTML
елементах.

#### Випадки використання:

1. **Конфігурація компонентів:**

```html
<div class="slider" data-speed="500" data-autoplay="true">
  <!-- Контент слайдера -->
</div>
```

2. **Ідентифікація для JavaScript:**

```html
<tr data-user-id="123" data-status="active">
  <td>John Doe</td>
  <td><button data-action="edit">Редагувати</button></td>
</tr>
```

3. **Стан елементів:**

```html
<div class="modal" data-visible="false">
  <!-- Модальне вікно -->
</div>
```

4. **CSS стилізація за станом:**

```css
[data-status='active'] {
  color: green;
}
[data-status='inactive'] {
  color: gray;
}
```

**Переваги:** Валідний HTML, легкий доступ через JavaScript, не впливає на
стилізацію.

</details>

<details>
<summary>26. Як створити гіперпосилання в HTML?</summary>

#### HTML

Використовуємо тег `<a>`:

```html
<a href="https://example.com">Текст посилання</a>
```

- `href` — адреса, куди веде посилання.

- Можна додати `target="_blank"` для відкриття в новій вкладці.

#### Різні типи посилань:

```html
<!-- Зовнішнє посилання -->
<a href="https://google.com">Google</a>

<!-- Внутрішнє посилання -->
<a href="/about">Про нас</a>

<!-- Email посилання -->
<a href="mailto:contact@example.com">Написати листа</a>

<!-- Телефонне посилання -->
<a href="tel:+380123456789">Зателефонувати</a>

<!-- Посилання на файл -->
<a href="document.pdf">Завантажити PDF</a>
```

</details>

<details>
<summary>27. Що таке внутрішні та зовнішні гіперпосилання і які вони мають атрибути?</summary>

#### HTML

#### Зовнішні посилання:

- Ведуть на інші веб-сайти
- Починаються з `http://` або `https://`

#### Внутрішні посилання:

- Ведуть на сторінки того самого сайту
- Використовують відносні або абсолютні шляхи

#### Основні атрибути:

```html
<!-- Зовнішнє посилання -->
<a
  href="https://example.com"
  target="_blank"
  rel="noopener noreferrer"
  title="Перейти на example.com"
>
  Зовнішній сайт
</a>

<!-- Внутрішнє посилання -->
<a href="/contact" title="Сторінка контактів"> Контакти </a>

<!-- Якірне посилання -->
<a href="#section1" title="Перейти до розділу 1"> Розділ 1 </a>
```

**Атрибути:**

- `href` — URL адреса
- `target` — де відкрити (\_blank, \_self, \_parent, \_top)
- `rel` — відношення до цільової сторінки
- `title` — підказка при наведенні

</details>

<details>
<summary>28. Яка різниця між відносними та абсолютними URL-адресами?</summary>

#### HTML

**Абсолютний URL** — містить повний шлях із протоколом і доменом.

```html
<a href="https://example.com/page.html">Посилання</a>
```

Використовується для переходів на зовнішні ресурси або між доменами.

**Відносний URL** — вказує шлях відносно поточного документа.

```html
<a href="/page.html">Посилання</a>
<a href="page.html">Посилання</a>
<a href="../page.html">Посилання</a>
```

#### Типи відносних URL:

```html
<!-- Відносно кореня сайту -->
<a href="/about/team.html">Команда</a>

<!-- Відносно поточної папки -->
<a href="contact.html">Контакти</a>

<!-- На рівень вище -->
<a href="../index.html">Головна</a>

<!-- На кілька рівнів вище -->
<a href="../../docs/manual.pdf">Інструкція</a>
```

Зручно для внутрішніх сторінок сайту, особливо при розробці й тестуванні.

</details>

<details>
<summary>29. Як відкрити посилання в новій вкладці?</summary>

#### HTML

- Додати атрибут `target="_blank"` до тега `<a>`:

```html
<a href="https://example.com" target="_blank">Відкрити в новій вкладці</a>
```

- Рекомендовано також додати `rel="noopener noreferrer"` для безпеки:

```html
<a href="https://example.com" target="_blank" rel="noopener noreferrer">
  Відкрити в новій вкладці
</a>
```

#### Інші значення target:

```html
<!-- Поточна вкладка (за замовчуванням) -->
<a href="page.html" target="_self">Поточна вкладка</a>

<!-- Батьківський фрейм -->
<a href="page.html" target="_parent">Батьківський фрейм</a>

<!-- Верхній рівень вікна -->
<a href="page.html" target="_top">Верхній рівень</a>

<!-- Конкретне вікно/фрейм -->
<a href="page.html" target="myWindow">Конкретне вікно</a>
```

**Безпека:** `rel="noopener noreferrer"` запобігає доступу нової сторінки до
поточної через `window.opener`.

</details>

<details>
<summary>30. Як створити якір для переходу до певної частини сторінки?</summary>

#### HTML

- Додаємо ідентифікатор елементу:

```html
<h2 id="contacts">Контакти</h2>
```

- Створюємо посилання на цей id:

```html
<a href="#contacts">Перейти до контактів</a>
```

При кліку сторінка прокрутиться до елемента з таким id.

#### Повний приклад:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Якірні посилання</title>
  </head>
  <body>
    <!-- Навігація -->
    <nav>
      <a href="#about">Про нас</a>
      <a href="#services">Послуги</a>
      <a href="#contacts">Контакти</a>
    </nav>

    <!-- Контент -->
    <section id="about">
      <h2>Про нас</h2>
      <p>Інформація про компанію...</p>
    </section>

    <section id="services">
      <h2>Послуги</h2>
      <p>Опис наших послуг...</p>
    </section>

    <section id="contacts">
      <h2>Контакти</h2>
      <p>Контактна інформація...</p>
    </section>

    <!-- Повернутися на верх -->
    <a href="#top">↑ На верх</a>
  </body>
</html>
```

**CSS для плавної прокрутки:**

```css
html {
  scroll-behavior: smooth;
}
```

</details>

<details>
<summary>31. Як створити посилання на різні розділи на одній веб-сторінці HTML?</summary>

#### HTML

Відповідь: Для створення гіперпосилання використовується тег `<a>`. Атрибут href
вказує URL або шлях.

#### Повний приклад:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Якірні посилання</title>
  </head>
  <body>
    <!-- Навігація -->
    <nav>
      <a href="#about">Про нас</a>
      <a href="#services">Послуги</a>
      <a href="#contacts">Контакти</a>
    </nav>

    <!-- Контент -->
    <section id="about">
      <h2>Про нас</h2>
      <p>Інформація про компанію...</p>
    </section>

    <section id="services">
      <h2>Послуги</h2>
      <p>Опис наших послуг...</p>
    </section>

    <section id="contacts">
      <h2>Контакти</h2>
      <p>Контактна інформація...</p>
    </section>

    <!-- Повернутися на верх -->
    <a href="#top">↑ На верх</a>
  </body>
</html>
```

**CSS для плавної прокрутки:**

```css
html {
  scroll-behavior: smooth;
}
```

</details>

<details>
<summary>32. Як створити посилання на файл для завантаження в HTML?</summary>

#### HTML

Використати `<a>` з атрибутом `download`:

```html
<a href="files/manual.pdf" download>Завантажити інструкцію</a>
```

- href — шлях до файлу.

- download — каже браузеру зберегти файл замість відкриття.

Можна вказати ім'я:

```html
<a href="files/manual.pdf" download="Instrukciya.pdf">Завантажити</a>
```

#### Додаткові приклади:

```html
<!-- Завантажити з оригінальним ім'ям -->
<a href="document.pdf" download>Завантажити PDF</a>

<!-- Завантажити з новим ім'ям -->
<a href="report.xlsx" download="financial-report-2023.xlsx">
  Завантажити звіт
</a>

<!-- Завантажити зображення -->
<a href="photo.jpg" download="my-photo.jpg"> Зберегти фото </a>
```

**Примітка:** Атрибут `download` працює тільки для файлів з того самого домену
(same-origin).

</details>

<details>
<summary>33. Яке призначення атрибута target у тегу a в HTML?</summary>

#### HTML

Атрибут target визначає, де відкриється посилання:

- `_self` (за замовчуванням) — відкриває в тій самій вкладці.

- `_blank` — відкриває у новій вкладці/вікні.

- `_parent` — відкриває в батьківському фреймі (якщо є фрейми).

- `_top` — відкриває у всьому вікні, виходячи з фреймів.

- `customName` — відкриває в конкретному вікні/фреймі з цим ім'ям.

#### Приклади:

```html
<!-- За замовчуванням - поточна вкладка -->
<a href="page.html">Внутрішня сторінка</a>

<!-- Нова вкладка -->
<a href="https://example.com" target="_blank">Зовнішній сайт</a>

<!-- Нова вкладка з безпекою -->
<a href="https://example.com" target="_blank" rel="noopener noreferrer">
  Безпечне зовнішнє посилання
</a>

<!-- Конкретне вікно -->
<a href="help.html" target="helpWindow">Довідка</a>
```

**Безпека:** Для `target="_blank"` рекомендується додавати
`rel="noopener noreferrer"`.

</details>

<details>
<summary>34. Як вставляти зображення на HTML-сторінку?</summary>

#### HTML

Використовуємо тег `<img>`:

```html
<img src="image.jpg" alt="Опис зображення" />
```

- `src` — шлях до зображення.

- `alt` — текстовий опис для доступності та коли зображення не завантажилось.

Опційно: `width`, `height`, `title`.

#### Детальніші приклади:

```html
<!-- Основне використання -->
<img src="photo.jpg" alt="Фотографія заходу сонця" />

<!-- З розмірами -->
<img src="logo.png" alt="Логотип компанії" width="200" height="100" />

<!-- З підказкою -->
<img src="chart.png" alt="Графік продажів" title="Натисніть для збільшення" />

<!-- Відносний шлях -->
<img src="../images/banner.jpg" alt="Банер акції" />

<!-- Абсолютний URL -->
<img src="https://example.com/image.jpg" alt="Зовнішнє зображення" />
```

**Краща практика:** Завжди включайте атрибут `alt` для доступності.

</details>

<details>
<summary>35. Яке значення має атрибут alt для зображень?</summary>

#### HTML

`alt` — альтернативний текст для зображення.

#### Призначення:

- Показується, якщо зображення не завантажилось.

- Допомагає скрінрідерам робити сайт доступним.

- Використовується для SEO.

#### Приклади правильного використання:

```html
<!-- Інформативне зображення -->
<img
  src="chart.png"
  alt="Графік продажів за 2023 рік показує зростання на 25%"
/>

<!-- Декоративне зображення -->
<img src="decoration.png" alt="" />

<!-- Зображення-посилання -->
<a href="/home">
  <img src="logo.png" alt="Повернутися на головну сторінку" />
</a>

<!-- Складне зображення -->
<img src="infographic.jpg" alt="Інфографіка: кроки створення веб-сайту" />
```

**Правила:**

- Для декоративних зображень використовуйте `alt=""`
- Для інформативних - описуйте зміст
- Для посилань - описуйте призначення посилання

</details>

<details>
<summary>36. Які формати зображень підтримуються веббраузерами?</summary>

#### HTML

**Основні формати, які підтримують сучасні браузери:**

- `JPEG` / `JPG` — фотографії з високою деталізацією, стиснення з втратою
  якості.

- `PNG` — графіка з прозорістю, без втрати якості.

- `GIF` — анімація та прості картинки з обмеженою палітрою.

- `WebP` — сучасний формат з високим стисненням і прозорістю.

- `SVG` — векторна графіка, масштабована без втрати якості.

Менш поширені: BMP, ICO (для іконок).

#### Коли використовувати:

```html
<!-- JPEG для фотографій -->
<img src="photo.jpg" alt="Пейзаж" />

<!-- PNG для графіки з прозорістю -->
<img src="logo.png" alt="Логотип" />

<!-- GIF для анімації -->
<img src="loading.gif" alt="Завантаження" />

<!-- WebP для оптимізації -->
<img src="optimized.webp" alt="Оптимізоване зображення" />

<!-- SVG для векторної графіки -->
<img src="icon.svg" alt="Іконка" />
```

**Сучасні тенденції:** WebP та AVIF для кращого стиснення, SVG для іконок та
простої графіки.

</details>

<details>
<summary>37. Які різні типи списків доступні в HTML?</summary>

#### HTML

В HTML є три основні типи списків:

1. **Нумерований список (`<ol>`)** — елементи пронумеровані:

2. **Маркований список (`<ul>`)** — елементи з маркерами (кульки, квадрати):

3. **Список визначень (`<dl>`)** — термін + опис:

#### Приклади:

```html
<!-- Нумерований список -->
<ol>
  <li>Перший крок</li>
  <li>Другий крок</li>
  <li>Третій крок</li>
</ol>

<!-- Маркований список -->
<ul>
  <li>Молоко</li>
  <li>Хліб</li>
  <li>Яйця</li>
</ul>

<!-- Список визначень -->
<dl>
  <dt>HTML</dt>
  <dd>HyperText Markup Language</dd>
  <dt>CSS</dt>
  <dd>Cascading Style Sheets</dd>
</dl>
```

</details>

<details>
<summary>38. Як створювати впорядковані, невпорядковані списки та списки з описом у HTML?</summary>

#### HTML

1. **Впорядкований список (`<ol>`):**

```html
<ol>
  <li>Перший</li>
  <li>Другий</li>
</ol>
```

2. **Невпорядкований список (`<ul>`):**

```html
<ul>
  <li>Пункт 1</li>
  <li>Пункт 2</li>
</ul>
```

3. **Список з описом (`<dl>`):**

```html
<dl>
  <dt>HTML</dt>
  <dd>Мова розмітки</dd>
  <dt>JavaScript</dt>
  <dd>Мова програмування</dd>
</dl>
```

#### Розширені приклади:

```html
<!-- Нумерований список з атрибутами -->
<ol type="A" start="3">
  <li>Третій пункт (C)</li>
  <li>Четвертий пункт (D)</li>
</ol>

<!-- Список з різними маркерами (CSS) -->
<ul style="list-style-type: square;">
  <li>Квадратний маркер</li>
  <li>Ще один квадратний маркер</li>
</ul>
```

</details>

<details>
<summary>39. Чи можна вкладати списки в HTML? Якщо так, то як?</summary>

#### HTML

Так, можна. Вкладені списки створюють всередині `<li>` елемента:

```html
<ul>
  <li>
    Пункт 1
    <ul>
      <li>Вкладений пункт 1</li>
      <li>Вкладений пункт 2</li>
    </ul>
  </li>
  <li>Пункт 2</li>
</ul>
```

Можна вкладати будь-які типи списків (`<ul>` всередині `<ol>` і навпаки).

#### Більш складний приклад:

```html
<ol>
  <li>
    Веб-технології
    <ul>
      <li>
        Frontend
        <ul>
          <li>HTML</li>
          <li>CSS</li>
          <li>JavaScript</li>
        </ul>
      </li>
      <li>
        Backend
        <ul>
          <li>Node.js</li>
          <li>Python</li>
          <li>PHP</li>
        </ul>
      </li>
    </ul>
  </li>
  <li>Мобільна розробка</li>
</ol>
```

**Правило:** Вкладений список завжди має бути всередині `<li>`, а не між `<li>`
елементами.

</details>

<details>
<summary>40. Як можна згрупувати опції всередині тегу select?</summary>

#### HTML

Для групування опцій у випадаючому списку використовуйте тег `<optgroup>`:

```html
<select name="course">
  <optgroup label="Фронтенд">
    <option value="html">HTML</option>
    <option value="css">CSS</option>
    <option value="js">JavaScript</option>
  </optgroup>

  <optgroup label="Бекенд">
    <option value="php">PHP</option>
    <option value="python">Python</option>
    <option value="nodejs">Node.js</option>
  </optgroup>

  <optgroup label="Дизайн">
    <option value="photoshop">Photoshop</option>
    <option value="figma">Figma</option>
  </optgroup>
</select>
```

#### Переваги `<optgroup>`:

- Візуально групує пов'язані опції
- Покращує юзабіліті для довгих списків
- Підтримує атрибут `label` для назви групи
- Можна вимкнути групу через `disabled`

#### Приклад з вимкненою групою:

```html
<select name="country">
  <optgroup label="Європа">
    <option value="ua">Україна</option>
    <option value="pl">Польща</option>
  </optgroup>

  <optgroup label="Азія" disabled>
    <option value="jp">Японія</option>
    <option value="cn">Китай</option>
  </optgroup>
</select>
```

</details>

<details>
<summary>41. Що таке HTML-форми та як їх створити?</summary>

#### HTML

HTML-форма — це елемент, який збирає дані від користувача та відправляє їх на
сервер або обробляє на клієнті.

#### Приклад створення:

```html
<form action="/submit" method="post">
  <label for="name">Ім'я:</label>
  <input type="text" id="name" name="name" />

  <label for="email">Email:</label>
  <input type="email" id="email" name="email" />

  <button type="submit">Відправити</button>
</form>
```

- `<form>` — контейнер форми.
- `action` — URL, куди відправляються дані.
- `method` — спосіб відправки (get або post).

**Поля вводу** (`<input>`, `<textarea>`, `<select>`) + кнопки (`<button>` або
`<input type="submit">`).

#### Розширений приклад:

```html
<form action="/register" method="post" enctype="multipart/form-data">
  <fieldset>
    <legend>Реєстрація користувача</legend>

    <label for="username">Логін:</label>
    <input type="text" id="username" name="username" required />

    <label for="password">Пароль:</label>
    <input type="password" id="password" name="password" required />

    <label for="avatar">Аватар:</label>
    <input type="file" id="avatar" name="avatar" accept="image/*" />

    <button type="submit">Зареєструватися</button>
    <button type="reset">Очистити</button>
  </fieldset>
</form>
```

</details>

<details>
<summary>42. Опишіть різні типи вхідних даних форм у HTML5.</summary>

#### HTML

В HTML5 у `<input>` з'явилося багато типів для збору різних даних:

#### Текстові типи:

- `text` — звичайне текстове поле.
- `password` — поле з прихованим введенням.
- `email` — перевірка формату email.
- `url` — перевірка формату URL.
- `tel` — для телефонів (без валідації формату в HTML).
- `search` — поле пошуку.

#### Числові типи:

- `number` — числове поле зі стрілками.
- `range` — повзунок для вибору значення.

#### Дата і час:

- `date` — вибір дати.
- `month` — вибір місяця та року.
- `week` — вибір тижня.
- `time` — вибір часу.
- `datetime-local` — дата і час без часової зони.

#### Інші типи:

- `color` — вибір кольору.
- `checkbox` — прапорець.
- `radio` — перемикач (один із групи).
- `file` — вибір файлу для завантаження.
- `hidden` — приховане поле для передачі даних.

#### Кнопки:

- `submit`, `reset`, `button` — кнопки.

#### Приклади:

```html
<input type="email" placeholder="user@example.com" />
<input type="number" min="1" max="100" step="1" />
<input type="range" min="0" max="100" value="50" />
<input type="date" value="2023-12-31" />
<input type="color" value="#ff0000" />
```

</details>

<details>
<summary>43. Як зробити вхідні дані форм обов'язковими?</summary>

#### HTML

Щоб зробити поле форми обов'язковим, додаємо атрибут `required`:

```html
<input type="email" name="userEmail" required />
```

- Браузер не дасть відправити форму, поки поле не заповнене.

- Для спеціалізованих типів (email, number, url) додатково перевіряється формат
  введення.

#### Розширені приклади:

```html
<!-- Обов'язкове текстове поле -->
<input type="text" name="name" required placeholder="Введіть ваше ім'я" />

<!-- Обов'язковий вибір з випадаючого списку -->
<select name="country" required>
  <option value="">Оберіть країну</option>
  <option value="ua">Україна</option>
  <option value="pl">Польща</option>
</select>

<!-- Обов'язкове прийняття умов -->
<input type="checkbox" name="terms" required />
<label for="terms">Я погоджуюсь з умовами використання</label>

<!-- Обов'язкове заповнення textarea -->
<textarea name="message" required placeholder="Ваше повідомлення"></textarea>
```

**Стилізація через CSS:**

```css
input:required {
  border-left: 3px solid red;
}

input:valid {
  border-left: 3px solid green;
}
```

</details>

<details>
<summary>44. Яке призначення елемента label у формах?</summary>

#### HTML

`<label>` пов'язує текстову підказку з елементом форми, щоб користувачу було
зрозуміло, що вводити.

#### Переваги:

- Покращує доступність (скрінрідери читають підказку разом із полем).

- Клік по <label> автоматично фокусує пов'язане поле.

#### Приклади:

**Зовнішній label (через for та id):**

```html
<label for="email">Email:</label> <input type="email" id="email" name="email" />
```

**Внутрішній label (обгортає елемент):**

```html
<label>
  <input type="checkbox" name="agree" />
  Погоджуюсь з умовами
</label>
```

**Для radio buttons:**

```html
<fieldset>
  <legend>Оберіть розмір:</legend>
  <label>
    <input type="radio" name="size" value="small" />
    Малий
  </label>
  <label>
    <input type="radio" name="size" value="large" />
    Великий
  </label>
</fieldset>
```

**Складніший приклад:**

```html
<div class="form-group">
  <label for="password"> Пароль <span class="required">*</span> </label>
  <input type="password" id="password" name="password" required />
  <small>Мінімум 8 символів</small>
</div>
```

</details>

<details>
<summary>45. Як групувати вхідні дані форм і чому це потрібно робити?</summary>

#### HTML

- Для групування даних у формах використовують `<fieldset>` і `<legend>`:

```html
<fieldset>
  <legend>Особисті дані</legend>
  <label for="name">Ім'я:</label>
  <input type="text" id="name" name="name" />

  <label for="email">Email:</label>
  <input type="email" id="email" name="email" />
</fieldset>
```

#### Навіщо:

- Візуально та логічно об'єднує пов'язані поля.

- Покращує доступність (скрінрідери читають легенду).

- Допомагає структурувати великі форми і робить їх зручнішими для користувача.

#### Розширений приклад:

```html
<form>
  <fieldset>
    <legend>Контактна інформація</legend>
    <label for="phone">Телефон:</label>
    <input type="tel" id="phone" name="phone" />

    <label for="address">Адреса:</label>
    <textarea id="address" name="address"></textarea>
  </fieldset>

  <fieldset>
    <legend>Налаштування акаунту</legend>
    <label for="notifications">
      <input type="checkbox" id="notifications" name="notifications" />
      Отримувати сповіщення
    </label>

    <label for="privacy">
      <input type="radio" id="privacy" name="privacy" value="public" />
      Публічний профіль
    </label>
  </fieldset>

  <fieldset disabled>
    <legend>Преміум функції</legend>
    <input type="checkbox" name="premium" disabled />
    <label>Доступно тільки для преміум користувачів</label>
  </fieldset>
</form>
```

</details>

<details>
<summary>46. Як створити форму в HTML і забезпечити її валідацію?</summary>

#### HTML

Створення форми з валідацією включає використання HTML5 атрибутів та JavaScript
для розширеної перевірки.

#### HTML5 валідація:

```html
<form action="/submit" method="post" novalidate>
  <label for="username">Логін:</label>
  <input
    type="text"
    id="username"
    name="username"
    required
    minlength="3"
    maxlength="20"
    pattern="[a-zA-Z0-9_]+"
    title="Тільки літери, цифри та підкреслення"
  />

  <label for="email">Email:</label>
  <input type="email" id="email" name="email" required />

  <label for="age">Вік:</label>
  <input type="number" id="age" name="age" min="18" max="120" required />

  <label for="website">Веб-сайт:</label>
  <input type="url" id="website" name="website" />

  <button type="submit">Відправити</button>
</form>
```

#### Атрибути валідації:

- `required` — обов'язкове поле
- `minlength/maxlength` — мінімальна/максимальна довжина
- `min/max` — мінімальне/максимальне значення для чисел
- `pattern` — регулярний вираз
- `step` — крок для числових полів

#### CSS для стилізації:

```css
input:valid {
  border: 2px solid green;
}

input:invalid {
  border: 2px solid red;
}

input:required {
  background-color: #fff8dc;
}
```

</details>

<details>
<summary>47. Які методи відправки даних форми ви знаєте?</summary>

#### HTML

Основні методи HTTP для відправки форм:

#### GET метод:

```html
<form action="/search" method="get">
  <input type="text" name="query" placeholder="Пошук..." />
  <button type="submit">Шукати</button>
</form>
```

**Характеристики GET:**

- Дані додаються до URL як параметри запиту
- Видимі в адресному рядку
- Можна додати в закладки
- Обмеження по розміру даних
- Використовується для пошуку, фільтрів

#### POST метод:

```html
<form action="/submit" method="post">
  <input type="text" name="username" required />
  <input type="password" name="password" required />
  <button type="submit">Увійти</button>
</form>
```

**Характеристики POST:**

- Дані відправляються в тілі запиту
- Не видимі в URL
- Немає обмежень по розміру
- Використовується для створення, оновлення даних

#### Додаткові атрибути:

```html
<!-- Для завантаження файлів -->
<form action="/upload" method="post" enctype="multipart/form-data">
  <input type="file" name="document" required />
  <button type="submit">Завантажити</button>
</form>

<!-- Перевизначення методу -->
<form action="/update" method="post">
  <input type="hidden" name="_method" value="PUT" />
  <button type="submit">Оновити</button>
</form>
```

</details>

<details>
<summary>48. Основні атрибути HTML-форм? Як вони впливають на надсилання даних з веб-сторінки?</summary>

#### HTML

#### Атрибути елемента `<form>`:

**action** — URL для відправки даних:

```html
<form action="/process-form" method="post"></form>
```

**method** — HTTP метод (GET, POST):

```html
<form method="post">
  <!-- Безпечно для конфіденційних даних -->
  <form method="get"><!-- Для пошуку та фільтрів --></form>
</form>
```

**enctype** — кодування даних:

```html
<!-- За замовчуванням -->
<form enctype="application/x-www-form-urlencoded">
  <!-- Для файлів -->
  <form enctype="multipart/form-data">
    <!-- Простий текст -->
    <form enctype="text/plain"></form>
  </form>
</form>
```

**target** — де відкрити результат:

```html
<form target="_blank">
  <!-- В новому вікні -->
  <form target="_self">
    <!-- В поточному вікні -->
    <form target="frame1"><!-- В конкретному фреймі --></form>
  </form>
</form>
```

**novalidate** — вимкнути HTML5 валідацію:

```html
<form novalidate>
  <!-- Валідація тільки через JavaScript -->
</form>
```

**autocomplete** — автозаповнення:

```html
<form autocomplete="on">
  <!-- Увімкнути -->
  <form autocomplete="off"><!-- Вимкнути --></form>
</form>
```

#### Приклад повної форми:

```html
<form
  action="/contact"
  method="post"
  enctype="multipart/form-data"
  autocomplete="on"
  target="_self"
>
  <input type="text" name="name" autocomplete="name" />
  <input type="email" name="email" autocomplete="email" />
  <input type="file" name="attachment" />

  <button type="submit">Відправити</button>
</form>
```

</details>

<details>
<summary>49. Для чого використовується елемент datalist?</summary>

#### HTML

`<datalist>` надає список готових варіантів для поля вводу, створюючи
автодоповнення (autocomplete dropdown).

#### Основне використання:

```html
<label for="browser">Оберіть браузер:</label>
<input list="browsers" id="browser" name="browser" />

<datalist id="browsers">
  <option value="Chrome"></option>
  <option value="Firefox"></option>
  <option value="Safari"></option>
  <option value="Edge"></option>
  <option value="Opera"></option>
</datalist>
```

#### Переваги:

- Користувач може обрати зі списку або ввести власний варіант
- Покращує UX через швидкий вибір
- Працює з різними типами input

#### Розширені приклади:

```html
<!-- З описом опцій -->
<input list="languages" name="language" placeholder="Мова програмування" />
<datalist id="languages">
  <option value="JavaScript" label="JS - Веб-розробка"></option>
  <option value="Python" label="Python - Дані та ШІ"></option>
  <option value="Java" label="Java - Корпоративна розробка"></option>
</datalist>

<!-- Для емейлів -->
<input type="email" list="email-domains" name="email" />
<datalist id="email-domains">
  <option value="@gmail.com"></option>
  <option value="@yahoo.com"></option>
  <option value="@outlook.com"></option>
</datalist>

<!-- Для URL -->
<input type="url" list="sites" name="website" />
<datalist id="sites">
  <option value="https://github.com/"></option>
  <option value="https://stackoverflow.com/"></option>
  <option value="https://developer.mozilla.org/"></option>
</datalist>
```

**Підтримка браузерів:** Всі сучасні браузери. У старих браузерах працює як
звичайний input.

</details>

<details>
<summary>50. Що таке елемент output у HTML5?</summary>

#### HTML

`<output>` представляє результат обчислення або дії користувача. Зазвичай
використовується для відображення результатів форм або динамічних розрахунків.

#### Основні атрибути:

- `for` — вказує на елементи, які впливають на результат
- `form` — пов'язує з конкретною формою
- `name` — ім'я для надсилання з формою

#### Приклад з обчисленням:

```html
<form>
  <label for="quantity">Кількість:</label>
  <input type="number" id="quantity" name="quantity" value="1" min="1" />

  <label for="price">Ціна:</label>
  <input type="number" id="price" name="price" value="100" step="0.01" />

  <label for="total">Загальна сума:</label>
  <output id="total" name="total" for="quantity price">100</output>
</form>

<script>
  function updateTotal() {
    const quantity = document.getElementById('quantity').value;
    const price = document.getElementById('price').value;
    const total = quantity * price;
    document.getElementById('total').textContent = total.toFixed(2);
  }

  document.getElementById('quantity').addEventListener('input', updateTotal);
  document.getElementById('price').addEventListener('input', updateTotal);
</script>
```

#### Приклад з прогрес-баром:

```html
<form>
  <label for="progress-slider">Прогрес:</label>
  <input type="range" id="progress-slider" min="0" max="100" value="50" />

  <output id="progress-value" for="progress-slider">50%</output>
</form>

<script>
  document
    .getElementById('progress-slider')
    .addEventListener('input', function () {
      document.getElementById('progress-value').textContent = this.value + '%';
    });
</script>
```

**Семантика:** `<output>` є семантично правильним способом показати результати,
на відміну від `<span>` або `<div>`.

</details>

<details>
<summary>51. Що таке семантичний HTML?</summary>

#### HTML

- Семантичний HTML — це використання тегів за їхнім змістовим призначенням
  (`<header>`, `<main>`, `<article>`, `<section>`, `<nav>`, `<footer>`, а не
  `<div>` всюди).

- Це робить структуру сторінки зрозумілішою для браузерів, пошукових систем і
  `assistive`-технологій.

- Для `SEO` це критично: пошуковики краще розпізнають ієрархію контенту,
  визначають головні частини сторінки та підвищують релевантність у видачі.

Семантична розмітка = краща доступність + зрозуміла структура + підсилення SEO.

</details>

<details>
<summary>52. Що таке семантичні теги HTML і чому вони важливі?</summary>

#### HTML

Семантичні теги HTML — це теги, які описують зміст і роль свого вмісту
(наприклад, `<header>`, `<main>`, `<article>`, `<footer>`).

#### Чому важливі:

- Поліпшують SEO — пошукові системи краще розуміють структуру.

- Доступність — скрінрідери можуть правильно інтерпретувати вміст.

- Легше підтримувати та читати код.

- Стандартизують структуру сторінки.

</details>

<details>
<summary>53. Чим відрізняється article від section?</summary>

#### HTML

- `<article>` — самостійний контент, який може існувати окремо (новини,
  блог-пости, коментарі). Має зміст, зрозумілий поза контекстом сторінки.

- `<section>` — тематичний розділ контенту, частина більшої структури. Зазвичай
  має заголовок і логічно пов'язаний із рештою сторінки.

#### Приклад:

```html
<article>
  <h2>Стаття про HTML5</h2>
  <section>
    <h3>Семантичні теги</h3>
    <p>Опис семантичних тегів...</p>
  </section>
  <section>
    <h3>Доступність</h3>
    <p>Як семантика покращує доступність...</p>
  </section>
</article>
```

</details>

<details>
<summary>54. Що нового в HTML5 порівняно з попередніми версіями?</summary>

#### HTML

Основні нововведення HTML5:

- Семантичні теги: `<header>`, `<footer>`, `<main>`, `<article>`, `<section>`,
  `<nav>`.

- Розширені форми: нові типи `<input>` (email, url, number, date, color тощо) та
  атрибути (required, placeholder, pattern).

- Мультимедіа: `<audio>` і `<video>` без сторонніх плагінів.

- Графіка: `<canvas>` для растрової графіки, `<svg>` для векторної.

- API для JS: локальне сховище (localStorage, sessionStorage), геолокація,
  drag-and-drop, Web Workers.

- Подкастинг та інтеграція: `<figure>`, `<figcaption>` для зображень і підписів.

- Покращена підтримка мобільних: `<meta name="viewport">` та адаптивність.

</details>

<details>
<summary>55. Як створити розділ на веб-сторінці за допомогою семантичних елементів HTML5?</summary>

#### HTML

У HTML5 для створення розділів використовують семантичні теги:

```html
<section>
  <h2>Про нас</h2>
  <p>Текст про компанію...</p>
</section>

<article>
  <h2>Новина дня</h2>
  <p>Текст новини...</p>
</article>

<aside>
  <h3>Підказка</h3>
  <p>Додаткова інформація</p>
</aside>
```

- `<section>` — логічний розділ сторінки.

- `<article>` — самостійний блок контенту, який може існувати окремо.

- `<aside>` — побічна інформація, наприклад, сайдбар.

- `<header>` і `<footer>` — заголовки та підвал розділів або сторінки.

</details>

<details>
<summary>56. Яка роль елемента article у HTML5?</summary>

#### HTML

`<article>` — семантичний елемент для самостійного контенту, який може існувати
окремо від сторінки і бути зрозумілий поза контекстом.

#### Приклади використання:

- Новини, блоги, публікації.

- Коментарі користувачів.

- Форумні повідомлення.

#### Переваги:

- Покращує SEO і доступність.

- Легко стилізується та структуровано організовує контент.

</details>

<details>
<summary>57. Чи можете ви пояснити використання елементів nav та aside у HTML5?</summary>

#### HTML

- `<nav>` — семантичний контейнер для основної навігації по сайту: меню,
  посилання на розділи чи сторінки.

```html
<nav>
  <a href="/">Головна</a>
  <a href="/about">Про нас</a>
</nav>
```

- `<aside>` — для додаткового або побічного контенту, який не є головним,
  наприклад, сайдбари, підказки, реклами:

```html
<aside>
  <h3>Поради</h3>
  <p>Корисна інформація для користувача</p>
</aside>
```

Коротко: <nav> = навігація, <aside> = допоміжний або боковий контент.

</details>

<details>
<summary>58. Як використовувати елементи figure та figcaption?</summary>

#### HTML

- `<figure>` — контейнер для медіа (зображення, графіка, відео) із підписом.

- `<figcaption>` — підпис до медіа всередині `<figure>`.

#### Приклад:

```html
<figure>
  <img src="image.jpg" alt="Опис зображення" />
  <figcaption>Підпис до зображення</figcaption>
</figure>
```

- Покращує семантику та доступність.

- Легко стилізується CSS.

</details>

<details>
<summary>59. Як створити таблицю в HTML і які основні теги для цього використовуються?</summary>

#### HTML

В HTML таблиця створюється тегом `<table>`. Рядки — `<tr>`, заголовки стовпців —
`<th>`, комірки — `<td>`.

#### Приклад:

```html
<table>
  <tr>
    <th>Ім'я</th>
    <th>Вік</th>
  </tr>
  <tr>
    <td>Іван</td>
    <td>25</td>
  </tr>
</table>
```

</details>

<details>
<summary>60. Що таке thead, tbody та tfoot у HTML-таблиці і для чого вони потрібні?</summary>

#### HTML

- `<thead>` — групує рядки заголовків таблиці.

- `<tbody>` — основна частина таблиці з даними.

- `<tfoot>` — групує рядки підсумків (footer таблиці), відображається після
  tbody, але може рендеритися браузером перед ним для оптимізації.

#### Приклад:

```html
<table>
  <thead>
    <tr>
      <th>Назва</th>
      <th>Ціна</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Товар 1</td>
      <td>100 грн</td>
    </tr>
    <tr>
      <td>Товар 2</td>
      <td>200 грн</td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td>Загалом</td>
      <td>300 грн</td>
    </tr>
  </tfoot>
</table>
```

#### Переваги:

- Покращує семантику та доступність
- Дозволяє стилізувати різні частини таблиці окремо
- Браузери можуть фіксувати заголовки при прокрутці

</details>

<details>
<summary>61. Що таке атрибути colspan і rowspan у HTML-таблицях?</summary>

#### HTML

- `colspan` — об'єднує комірку по кількох стовпцях.

- `rowspan` — об'єднує комірку по кількох рядках.

```html
<td colspan="2">Об'єднано 2 стовпці</td>
<td rowspan="3">Об'єднано 3 рядки</td>
```

#### Приклад:

```html
<table border="1">
  <tr>
    <th colspan="2">Заголовок на 2 колонки</th>
    <th rowspan="2">Вертикальний заголовок</th>
  </tr>
  <tr>
    <td>Комірка 1</td>
    <td>Комірка 2</td>
  </tr>
  <tr>
    <td>Комірка 3</td>
    <td>Комірка 4</td>
    <td>Комірка 5</td>
  </tr>
</table>
```

</details>

<details>
<summary>62. Як зробити HTML-таблицю доступною для користувачів з екранними рідерами?</summary>

#### HTML

- Використовувати семантичні теги: `<table>`, `<thead>`, `<tbody>`, `<tfoot>`,
  `<th>`.

- Додавати атрибут scope у `<th>` (scope="col" або scope="row") для зв'язку
  заголовків і комірок.

- Додавати `<caption>` для опису таблиці.

- Уникати зайвого `rowspan/colspan`, якщо вони ускладнюють навігацію.

- Забезпечити достатній контраст та видимі фокуси при навігації з клавіатури.

#### Приклад доступної таблиці:

```html
<table>
  <caption>
    Продажі за 2024 рік
  </caption>
  <thead>
    <tr>
      <th scope="col">Місяць</th>
      <th scope="col">Продажі</th>
      <th scope="col">Прибуток</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Січень</th>
      <td>1000</td>
      <td>200</td>
    </tr>
  </tbody>
</table>
```

</details>

<details>
<summary>63. Що таке елемент canvas? І для чого він використовується?</summary>

#### HTML

`<canvas>` — растровий холст для малювання графіки через JavaScript API.

#### Використання:

- Ігри та інтерактивна графіка
- Складні візуалізації даних
- Обробка зображень
- Анімації та ефекти

#### Приклад:

```html
<canvas id="myCanvas" width="400" height="200"></canvas>

<script>
  const canvas = document.getElementById('myCanvas');
  const ctx = canvas.getContext('2d');

  // Малюємо прямокутник
  ctx.fillStyle = 'blue';
  ctx.fillRect(50, 50, 100, 75);

  // Малюємо коло
  ctx.beginPath();
  ctx.arc(200, 100, 50, 0, 2 * Math.PI);
  ctx.fillStyle = 'red';
  ctx.fill();
</script>
```

</details>

<details>
<summary>64. Різниця між canvas та svg? У яких випадках краще використовувати canvas, а в яких svg?</summary>

#### HTML

#### `<canvas>`:

- Растрова графіка (пікселі)
- Малювання через JavaScript API
- Підходить для ігор, складної анімації, обробки зображень
- Масштабування може погіршити якість
- Неможливо стилізувати окремі елементи CSS

#### `<svg>`:

- Векторна графіка (математичні об'єкти)
- Описується XML-розміткою
- Підходить для іконок, логотипів, простих діаграм
- Безкінечне масштабування без втрати якості
- Можна стилізувати CSS та анімувати

#### Коли використовувати:

**Canvas** → ігри, складна графіка, обробка фото, реал-тайм анімації

**SVG** → іконки, логотипи, прості діаграми, масштабована графіка

</details>

<details>
<summary>65. Яка різниця між елементами svg та canvas?</summary>

#### HTML

- `<svg>` — векторна графіка, кожен елемент DOM-структурований, масштабований
  без втрати якості, легкий для анімації та стилізації через CSS/JS.

- `<canvas>` — растровий холст, малювання відбувається через JS API, не має
  внутрішньої семантики елементів, масштабування може знизити якість, підходить
  для ігор і складної графіки.

#### Порівняння:

| Характеристика | SVG                               | Canvas                      |
| -------------- | --------------------------------- | --------------------------- |
| Тип графіки    | Векторна                          | Растрова                    |
| DOM-структура  | Так                               | Ні                          |
| Масштабування  | Без втрат                         | З втратами                  |
| Стилізація CSS | Так                               | Обмежено                    |
| Продуктивність | Повільніше при багатьох елементах | Швидше для складної графіки |

</details>

<details>
<summary>66. Що ви знаєте про SVG? Які є варіанти додавання SVG на сторінки сайту? Чим вони відрізняються?</summary>

#### HTML

**SVG (Scalable Vector Graphics)** — векторний формат для графіки, що
масштабується без втрати якості.

#### Способи додавання SVG:

1. **Inline SVG** — безпосередньо в HTML:

```html
<svg width="100" height="100">
  <circle cx="50" cy="50" r="40" fill="red" />
</svg>
```

- **Переваги:** повний контроль CSS/JS, доступність
- **Недоліки:** збільшує розмір HTML

2. **Як зображення** — через `<img>`:

```html
<img src="icon.svg" alt="Іконка" />
```

- **Переваги:** кешується, компактний HTML
- **Недоліки:** не можна стилізувати CSS

3. **CSS background**:

```css
.icon {
  background-image: url('icon.svg');
}
```

4. **Через `<object>` або `<embed>`**:

```html
<object data="graphic.svg" type="image/svg+xml"></object>
```

**Найкращий вибір:** inline для іконок, що потребують стилізації; `<img>` для
статичної графіки.

</details>

<details>
<summary>67. Як створювати карти зображень у HTML?</summary>

#### HTML

HTML-карта зображень (image map) дозволяє зробити частини зображення
клікабельними.

#### Приклад:

```html
<img src="plan.jpg" usemap="#map1" alt="План будівлі" />

<map name="map1">
  <area shape="rect" coords="34,44,270,350" href="room1.html" alt="Кімната 1" />
  <area shape="circle" coords="337,300,44" href="room2.html" alt="Кімната 2" />
  <area
    shape="poly"
    coords="400,50,500,50,450,150"
    href="room3.html"
    alt="Кімната 3"
  />
</map>
```

#### Пояснення:

- `usemap="#map1"` — прив'язка картинки до карти
- `<area>` — задає клікабельну область:
  - `shape="rect"` — прямокутник (coords: x1,y1,x2,y2)
  - `shape="circle"` — коло (coords: x,y,radius)
  - `shape="poly"` — багатокутник (coords: x1,y1,x2,y2,x3,y3...)
- `href` — посилання при кліку
- `alt` — альтернативний текст для доступності

</details>

<details>
<summary>68. Як додати аудіо та відео в HTML-документ за допомогою вбудованих тегів?</summary>

#### HTML

- **Аудіо** — тег `<audio>` з атрибутом controls:

```html
<audio controls>
  <source src="sound.mp3" type="audio/mpeg" />
  <source src="sound.ogg" type="audio/ogg" />
  Ваш браузер не підтримує аудіо.
</audio>
```

- **Відео** — тег `<video>` з атрибутом controls:

```html
<video controls width="640" height="360">
  <source src="video.mp4" type="video/mp4" />
  <source src="video.webm" type="video/webm" />
  Ваш браузер не підтримує відео.
</video>
```

#### Важливо:

- `<source>` — дозволяє вказати кілька форматів для кращої сумісності
- Текст між тегами — fallback для старих браузерів
- `controls` — показує елементи керування (play/pause/volume)

</details>

<details>
<summary>69. Які основні атрибути підтримують теги video та audio у HTML?</summary>

#### HTML

#### Спільні атрибути для `<video>` та `<audio>`:

- `src` — шлях до файлу (можна замість `<source>`)
- `controls` — відображає елементи керування
- `autoplay` — автоматичне відтворення (часто вимагає muted)
- `loop` — повторне відтворення після завершення
- `muted` — без звуку
- `preload` — підвантаження:
  - `none` — не завантажувати наперед
  - `metadata` — тільки метадані
  - `auto` — браузер сам вирішує

#### Додатково для `<video>`:

- `width`, `height` — розміри відеоплеєра
- `poster` — зображення-заставка до початку відтворення

#### Приклад:

```html
<video
  controls
  width="800"
  height="450"
  poster="preview.jpg"
  preload="metadata"
>
  <source src="movie.mp4" type="video/mp4" />
</video>
```

</details>

<details>
<summary>70. Як додати субтитри або підписи до відео в HTML?</summary>

#### HTML

Використати тег `<track>` всередині `<video>`.

#### Атрибути `<track>`:

- `src` — файл субтитрів (формат .vtt)
- `kind` — тип (subtitles, captions, descriptions, chapters, metadata)
- `srclang` — мова субтитрів (en, uk)
- `label` — назва треку в меню
- `default` — трек за замовчуванням

#### Приклад:

```html
<video controls>
  <source src="movie.mp4" type="video/mp4" />
  <track src="subtitles_en.vtt" kind="subtitles" srclang="en" label="English" />
  <track
    src="subtitles_uk.vtt"
    kind="subtitles"
    srclang="uk"
    label="Українська"
    default
  />
  <track
    src="descriptions.vtt"
    kind="descriptions"
    srclang="uk"
    label="Аудіоопис"
  />
</video>
```

#### Формат .vtt файлу:

```
WEBVTT

00:00:00.000 --> 00:00:03.000
Привіт! Це перший рядок субтитрів.

00:00:03.000 --> 00:00:06.000
А це другий рядок.
```

Браузер покаже вибір субтитрів, якщо формат `.vtt` коректний.

</details>

<details>
<summary>71. Чи можете ви пояснити призначення метатегів у HTML?</summary>

#### HTML

Метатеги у `<head>` зберігають метадані про сторінку — інформацію, яку не видно
користувачу, але використовують браузери, пошукові системи та сервіси.

#### Приклади призначення:

- `<meta charset="UTF-8">` — задає кодування.

- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` —
  адаптивність на мобільних.

- `<meta name="description" content="Опис сторінки">` — SEO.

- `<meta name="robots" content="index, follow">` — інструкції для пошукових
  ботів.

#### Додаткові приклади:

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    name="description"
    content="Короткий опис сторінки для пошукових систем"
  />
  <meta name="keywords" content="ключові, слова, для, seo" />
  <meta name="author" content="Ім'я автора" />
  <meta name="robots" content="index, follow" />

  <!-- Open Graph для соціальних мереж -->
  <meta property="og:title" content="Заголовок для Facebook" />
  <meta property="og:description" content="Опис для соціальних мереж" />
  <meta property="og:image" content="image.jpg" />

  <!-- Twitter Cards -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Заголовок для Twitter" />
</head>
```

</details>

<details>
<summary>72. Як пов'язати CSS-файл з HTML-документом?</summary>

#### HTML

- У `<head>` додаємо тег:

```html
<link rel="stylesheet" href="styles.css" />
```

#### Атрибути:

- `rel="stylesheet"` — вказує, що це файл стилів
- `href` — шлях до CSS-файлу

#### Додаткові варіанти:

```html
<!-- Основний CSS файл -->
<link rel="stylesheet" href="css/main.css" />

<!-- CSS з медіа-запитами -->
<link rel="stylesheet" href="css/print.css" media="print" />
<link rel="stylesheet" href="css/mobile.css" media="(max-width: 768px)" />

<!-- CSS з CDN -->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css"
/>

<!-- Внутрішні стилі -->
<style>
  body {
    margin: 0;
    padding: 20px;
  }
</style>
```

</details>

<details>
<summary>73. Як пов'язати JavaScript-файл з HTML-документом?</summary>

#### HTML

- Через тег `<script>`:

```html
<script src="script.js"></script>
```

#### Розміщення та атрибути:

```html
<!-- В <head> - завантажується до рендерингу сторінки -->
<head>
  <script src="script.js"></script>
</head>

<!-- Перед </body> - завантажується після HTML (рекомендовано) -->
<body>
  <!-- HTML контент -->
  <script src="script.js"></script>
</body>

<!-- Асинхронне завантаження -->
<script src="script.js" async></script>

<!-- Відкладене завантаження -->
<script src="script.js" defer></script>

<!-- Внутрішній JavaScript -->
<script>
  console.log('Привіт, світ!');
</script>

<!-- JavaScript з CDN -->
<script src="https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js"></script>
```

#### Різниця між async та defer:

- `async` — завантажується паралельно і виконується одразу
- `defer` — завантажується паралельно, але виконується після HTML

</details>

<details>
<summary>74. Що таке iframe і для чого його використовують?</summary>

#### HTML

`<iframe>` — це елемент для вбудовування іншої HTML-сторінки всередину поточної
сторінки.

#### Синтаксис:

```html
<iframe src="https://example.com" width="600" height="400"></iframe>
```

#### Основні атрибути:

```html
<iframe
  src="https://www.youtube.com/embed/dQw4w9WgXcQ"
  width="560"
  height="315"
  frameborder="0"
  allowfullscreen
  title="YouTube відео"
  loading="lazy"
>
</iframe>
```

#### Використання:

- **Вбудовування відео** (YouTube, Vimeo)
- **Карти** (Google Maps)
- **Соціальні віджети** (Facebook, Twitter)
- **Зовнішні форми** чи додатки
- **Пісочниці** для демонстрації коду

#### Атрибути безпеки:

```html
<iframe
  src="untrusted-content.html"
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="no-referrer"
>
</iframe>
```

**Недоліки:** може впливати на SEO, безпеку та швидкість завантаження.

</details>

<details>
<summary>75. Як додати коментар у HTML і чому його використовувати?</summary>

#### HTML

#### Синтаксис:

```html
<!-- Це коментар -->
```

#### Призначення:

- **Пояснення коду** для себе або колег
- **Тимчасове вимкнення** частини розмітки без видалення
- **Позначення секцій** коду для зручності навігації
- **Документування** складної структури

#### Приклади використання:

```html
<!-- Заголовок сторінки -->
<header>
  <h1>Моя сторінка</h1>
  <!-- TODO: додати логотип -->
</header>

<!-- Основний контент -->
<main>
  <section>
    <h2>Про нас</h2>
    <p>Текст про компанію...</p>
  </section>

  <!-- 
    Тимчасово приховано до завершення розробки
    <section>
      <h2>Наші послуги</h2>
      <p>Список послуг...</p>
    </section>
  -->
</main>

<!-- 
  Кінець основного контенту
  Далі йде підвал сторінки
-->
<footer>
  <p>&copy; 2024 Моя компанія</p>
</footer>
```

**Важливо:** коментарі видимі в коді сторінки, тому не додавайте конфіденційну
інформацію!

</details>

<details>
<summary>76. Різниця між кнопкою та посиланням у HTML?</summary>

#### HTML

#### `<button>` — для дій:

- Відправка форм
- Виклик JavaScript функцій
- Зміна стану сторінки
- Інтерактивні елементи UI

#### `<a>` — для навігації:

- Перехід на інші сторінки
- Переходи всередині сторінки (якорі)
- Завантаження файлів
- Посилання на зовнішні ресурси

#### Приклади правильного використання:

```html
<!-- Кнопки для дій -->
<button type="submit">Відправити форму</button>
<button onclick="toggleMenu()">Відкрити меню</button>
<button type="button" id="likeBtn">Подобається</button>

<!-- Посилання для навігації -->
<a href="/about">Про нас</a>
<a href="#contacts">Перейти до контактів</a>
<a href="document.pdf" download>Завантажити PDF</a>
<a href="https://external-site.com" target="_blank">Зовнішнє посилання</a>
```

#### Семантична важливість:

- **Кнопки** розуміються скрінрідерами як елементи дії
- **Посилання** розуміються як навігаційні елементи
- Це впливає на доступність та SEO

#### Стилізація:

```html
<!-- Посилання, стилізоване як кнопка (але семантично залишається посиланням) -->
<a href="/signup" class="btn">Зареєструватися</a>

<!-- Кнопка для навігації (неправильно з точки зору семантики) -->
<button onclick="location.href='/signup'">Зареєструватися</button>
```

**Правило:** використовуйте `<a>` для навігації, `<button>` для дій.

</details>

<details>
<summary>77. Як правильно створити семантичну панель навігації в HTML?</summary>

#### HTML

- Використовуємо семантичний тег `<nav>` з внутрішнім списком посилань
  `<ul><li><a>`. Це забезпечує доступність і правильну структуру.

#### Базовий приклад:

```html
<nav>
  <ul>
    <li><a href="/">Головна</a></li>
    <li><a href="/about">Про нас</a></li>
    <li><a href="/services">Послуги</a></li>
    <li><a href="/contact">Контакти</a></li>
  </ul>
</nav>
```

#### Розширений приклад з підменю:

```html
<nav aria-label="Основна навігація">
  <ul>
    <li><a href="/" aria-current="page">Головна</a></li>
    <li>
      <a href="/services">Послуги</a>
      <ul>
        <li><a href="/services/web-design">Веб-дизайн</a></li>
        <li><a href="/services/development">Розробка</a></li>
        <li><a href="/services/seo">SEO</a></li>
      </ul>
    </li>
    <li><a href="/about">Про нас</a></li>
    <li><a href="/contact">Контакти</a></li>
  </ul>
</nav>
```

#### Принципи семантичної навігації:

1. **Використовуйте `<nav>`** для основних навігаційних блоків
2. **Структуруйте списками** `<ul><li><a>`
3. **Додавайте `aria-label`** для множинних навігацій
4. **Позначайте поточну сторінку** `aria-current="page"`
5. **Забезпечте доступність** клавіатурної навігації

</details>

<details>
<summary>78. Як семантично правильно згорнути навігаційне меню?</summary>

#### HTML

Для семантично правильного згортання навігаційного меню використовуйте елемент
`<nav>` всередині якого знаходяться списки з посиланнями.

#### Приклад з використанням `<details>` та `<summary>`:

```html
<nav>
  <details>
    <summary>Меню</summary>
    <ul>
      <li><a href="/">Головна</a></li>
      <li><a href="/about">Про нас</a></li>
      <li><a href="/services">Послуги</a></li>
      <li><a href="/contact">Контакти</a></li>
    </ul>
  </details>
</nav>
```

#### Приклад з кнопкою для мобільного меню:

```html
<nav aria-label="Основна навігація">
  <button aria-expanded="false" aria-controls="main-menu" class="menu-toggle">
    ☰ Меню
  </button>

  <ul id="main-menu" class="nav-menu" hidden>
    <li><a href="/">Головна</a></li>
    <li><a href="/about">Про нас</a></li>
    <li><a href="/services">Послуги</a></li>
    <li><a href="/contact">Контакти</a></li>
  </ul>
</nav>

<script>
  document.querySelector('.menu-toggle').addEventListener('click', function () {
    const menu = document.getElementById('main-menu');
    const isExpanded = this.getAttribute('aria-expanded') === 'true';

    this.setAttribute('aria-expanded', !isExpanded);
    menu.hidden = isExpanded;
  });
</script>
```

#### Важливі принципи:

- Використовуйте **ARIA-атрибути** для доступності
- **`aria-expanded`** показує стан меню
- **`aria-controls`** вказує на контрольований елемент
- **`hidden`** приховує меню від скрінрідерів

</details>

<details>
<summary>79. Як створити базове випадаюче меню в HTML і CSS без JavaScript?</summary>

#### HTML

- Використовуємо вкладені списки `<ul>` і керуємо показом підменю через
  `:hover`.

#### Приклад:

```html
<nav>
  <ul class="menu">
    <li>
      <a href="/services">Послуги</a>
      <ul class="dropdown">
        <li><a href="/services/web-development">Веб-розробка</a></li>
        <li><a href="/services/ui-design">UI/UX Дизайн</a></li>
        <li><a href="/services/seo">SEO оптимізація</a></li>
      </ul>
    </li>
    <li><a href="/about">Про нас</a></li>
    <li><a href="/contact">Контакти</a></li>
  </ul>
</nav>

<style>
  /* Основні стилі меню */
  .menu {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
  }

  .menu li {
    position: relative;
  }

  .menu a {
    display: block;
    padding: 15px 20px;
    text-decoration: none;
    color: #333;
    background: #f8f9fa;
    border-right: 1px solid #ddd;
  }

  .menu a:hover {
    background: #e9ecef;
  }

  /* Стилі випадаючого меню */
  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 200px;
    background: white;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    display: none;
    z-index: 1000;
  }

  .dropdown li {
    width: 100%;
  }

  .dropdown a {
    border-right: none;
    border-bottom: 1px solid #eee;
  }

  /* Показати підменю при наведенні */
  .menu li:hover .dropdown {
    display: block;
  }

  /* Альтернативний варіант з плавною анімацією */
  .dropdown {
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
  }

  .menu li:hover .dropdown {
    opacity: 1;
    visibility: visible;
  }
</style>
```

#### Переваги:

- Працює без JavaScript
- Простота реалізації
- Хороша семантика

#### Недоліки:

- Не працює на дотик (мобільні)
- Обмежені можливості анімації
- Меню зникає при випадковому відведенні курсора

</details>

<details>
<summary>80. Різниця між meter та progress?</summary>

#### HTML

#### `<meter>` — для виміряних значень:

- Рівень заповнення
- Температура
- Бали або рейтинги
- Показники в певному діапазоні

#### `<progress>` — для прогресу завдань:

- Завантаження файлів
- Виконання процесів
- Прогрес форм
- Часові індикатори

#### Приклади:

```html
<!-- <meter> для виміряного значення -->
<label for="battery">Рівень заряду батареї:</label>
<meter id="battery" value="0.7" min="0" max="1">70%</meter>

<label for="score">Оцінка статті:</label>
<meter id="score" value="8" min="0" max="10">8 з 10</meter>

<label for="storage">Використання диска:</label>
<meter id="storage" value="650" min="0" max="1000" high="900" optimum="200">
  650 GB з 1000 GB
</meter>

<!-- <progress> для прогресу завдання -->
<label for="fileProgress">Прогрес завантаження:</label>
<progress id="fileProgress" value="30" max="100">30%</progress>

<label for="formProgress">Заповнення форми:</label>
<progress id="formProgress" value="2" max="5">Крок 2 з 5</progress>

<!-- Невизначений прогрес -->
<progress>Завантажується...</progress>
```

#### Атрибути `<meter>`:

- `value` — поточне значення
- `min`, `max` — діапазон
- `high`, `low` — пороги
- `optimum` — оптимальне значення

#### Атрибути `<progress>`:

- `value` — поточний прогрес
- `max` — максимальне значення
- Без `value` — невизначений прогрес

#### Візуальні відмінності:

- **Meter** зазвичай показує індикатор рівня
- **Progress** показує смугу прогресу
- Браузери стилізують їх по-різному

</details>

<details>
<summary>81. Що таке область перегляду (viewport) у веб-розробці та як її налаштувати?</summary>

#### HTML

- Область перегляду — це видима частина веб-сторінки у браузері користувача.
  Вона важлива для адаптивного дизайну. Налаштовується через мета-тег у
  `<head>`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

- `width=device-width` — ширина `viewport` дорівнює ширині екрана пристрою.

- `initial-scale=1` — початковий масштаб сторінки.

Це забезпечує коректне відображення на мобільних пристроях.

</details>

<details>
<summary>82. Розкажіть про meta-тег із name="viewport"?</summary>

#### HTML

- Мета-тег `viewport` контролює відображення веб-сторінки на мобільних
  пристроях:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

#### Основні параметри:

- `width=device-width` — ширина viewport дорівнює ширині екрана.

- `initial-scale=1.0` — початковий рівень масштабування.

- `maximum-scale` — максимальний масштаб.

- `minimum-scale` — мінімальний масштаб.

- `user-scalable=no` — заборона масштабування користувачем.

Без цього тегу мобільні браузери можуть відображати сторінку неправильно.

</details>

<details>
<summary>83. Як використовуються медіа-запити (media queries) для адаптивного дизайну в HTML/CSS?</summary>

#### HTML

- Медіа-запити дозволяють застосовувати різні стилі залежно від розміру екрану
  або типу пристрою. Використовуються у CSS, а не в HTML:

```css
/* Для екранів до 768px */
@media (max-width: 768px) {
  body {
    font-size: 14px;
  }
}

/* Для екранів від 769px */
@media (min-width: 769px) {
  body {
    font-size: 16px;
  }
}
```

Так можна робити адаптивний дизайн без зміни HTML-структури.

</details>

<details>
<summary>84. Як робити адаптивні зображення для різних пристроїв та роздільної здатності?</summary>

#### HTML

- Використовуються атрибути srcset та sizes у `<img>` або елемент `<picture>`:

**Приклад з `<img>`:**

```html
<img
  src="image-800.jpg"
  srcset="image-400.jpg 400w, image-800.jpg 800w, image-1200.jpg 1200w"
  sizes="(max-width: 600px) 400px, (max-width: 1200px) 800px, 1200px"
  alt="Адаптивне зображення"
/>
```

**Приклад з `<picture>`:**

```html
<picture>
  <source media="(max-width: 600px)" srcset="image-400.jpg" />
  <source media="(max-width: 1200px)" srcset="image-800.jpg" />
  <img src="image-1200.jpg" alt="Адаптивне зображення" />
</picture>
```

Це дозволяє браузеру обирати оптимальний розмір зображення під пристрій та
економити трафік.

</details>

<details>
<summary>85. Що таке адаптивний веб-дизайн (responsive web design)?</summary>

#### HTML

- Адаптивний веб-дизайн — це підхід до створення сайтів, коли макет і контент
  автоматично підлаштовуються під різні розміри екранів і пристроїв.

#### Основні принципи:

- Гнучкі сітки (`flexible grids`) — елементи у відсотках, а не в пікселях.

- Гнучкі зображення (`flexible images`) — використання max-width: 100%, srcset
  або `<picture>`.

- Медіа-запити (`media queries`) — зміна стилів залежно від ширини/типу
  пристрою.

Мета — однаково зручний UX на мобільних, планшетах і десктопах.

</details>

<details>
<summary>86. Як зробити HTML-таблицю адаптивною для мобільних пристроїв?</summary>

#### HTML

- Горизонтальний скрол (простий спосіб):

```css
.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}
```

```html
<div class="table-wrapper">
  <table>
    ...
  </table>
</div>
```

- Перетворення в картки на малих екранах через CSS (display: block + ::before з
  назвами колонок).

- CSS Grid / Flexbox для кастомних адаптивних таблиць.

- Мінімізувати кількість колонок для мобільних.

</details>

<details>
<summary>87. Що таке srcset? Як працює srcset?</summary>

#### HTML

- `srcset` — атрибут для адаптивних зображень, який дозволяє браузеру обирати
  найкращий варіант зображення залежно від умов (роздільності екрану, ширини
  viewport).

#### Синтаксис:

```html
<img
  src="image-800.jpg"
  srcset="image-400.jpg 400w, image-800.jpg 800w, image-1200.jpg 1200w"
  sizes="(max-width: 600px) 400px, 800px"
  alt="Зображення"
/>
```

- `400w, 800w, 1200w` — дескриптори ширини зображень.
- `sizes` — підказка браузеру про розмір відображення.

Браузер автоматично вибирає найбільш підходящий файл для поточних умов.

</details>

<details>
<summary>88. Навіщо використовується елемент picture?</summary>

#### HTML

- Елемент `<picture>` надає більше контролю над адаптивними зображеннями
  порівняно з `srcset`. Дозволяє:

- Використовувати різні формати зображень (WebP, AVIF для сучасних браузерів).
- Показувати різні зображення на різних пристроях (art direction).

#### Приклад:

```html
<picture>
  <source media="(max-width: 600px)" srcset="mobile.jpg" />
  <source media="(max-width: 1200px)" srcset="tablet.jpg" />
  <source srcset="desktop.webp" type="image/webp" />
  <img src="desktop.jpg" alt="Основне зображення" />
</picture>
```

Це забезпечує кращу оптимізацію та UX на різних пристроях.

</details>

<details>
<summary>89. Що таке доступність (accessibility) і чому вона важлива у веб-розробці?</summary>

#### HTML

Доступність — це практика створення веб-сайтів і застосунків, які можуть
використовувати люди з різними обмеженнями (зір, слух, моторика, когнітивні
особливості).

#### Чому важлива:

- Забезпечує рівний доступ до інформації для всіх користувачів.

- Підвищує SEO і відповідність стандартам (WCAG).

- Зменшує ризик юридичних проблем.

- Покращує загальний UX для всіх користувачів.

**Прості кроки:** семантичний HTML, alt-теги для зображень, достатній контраст,
клавіатурна навігація.

</details>

<details>
<summary>90. Як підвищити доступність веб-сайту (web accessibility)?</summary>

#### HTML

**Основні практики:**

- Семантичний HTML — використовуйте правильні теги (`<header>`, `<nav>`,
  `<main>`, `<button>`).

- Alt-тексти для зображень — описують зміст для користувачів з екранними
  читачами.

- Контрастність — достатній контраст тексту і фону.

- Клавіатурна навігація — забезпечити доступ до всіх інтерактивних елементів
  через клавіатуру.

- ARIA-атрибути — для додаткового опису ролей, станів та властивостей елементів.

- Форми та інтерфейси — підписані поля, зрозумілі повідомлення про помилки.

- Відео та аудіо — субтитри, транскрипти, аудіоописи.

Це підвищує UX для всіх і забезпечує відповідність стандартам WCAG.

</details>

<details>
<summary>91. Що таке ARIA-ролі і як їх використовувати у веб-розробці?</summary>

#### HTML

ARIA (Accessible Rich Internet Applications) — це набір атрибутів, які
допомагають екранним читачам та іншим допоміжним технологіям розуміти
призначення та стан елементів, особливо динамічних.

#### Приклади використання:

```html
<button aria-label="Закрити модальне вікно">×</button>
<div role="dialog" aria-modal="true" aria-labelledby="modalTitle">
  <h2 id="modalTitle">Форма зворотного зв'язку</h2>
</div>
```

- `role` — визначає тип елемента (button, dialog, alert).

- `aria-label` — додає опис для елементів без видимого тексту.

- `aria-labelledby` / `aria-describedby` — пов'язує елемент з текстовим описом.

- `aria-hidden="true"` — ховає елемент від допоміжних технологій.

Використовуйте ARIA тільки коли семантичний HTML не достатній.

</details>

<details>
<summary>92. Як використовувати атрибут tabindex у веб-розробці?</summary>

#### HTML

- `tabindex` визначає порядок фокусування елементів при навігації клавішею Tab.

  - `tabindex="0"` — елемент доступний у природному порядку документу.

  - `tabindex="-1"` — елемент не доступний через Tab, але його можна сфокусувати
    програмно (.focus()).

  - `tabindex="1", 2, …` — визначає конкретний порядок фокусування (не
    рекомендується, бо ускладнює підтримку).

#### Приклад:

```html
<input type="text" tabindex="1" />
<button tabindex="2">Надіслати</button>
<a href="#" tabindex="3">Детальніше</a>
```

Використовується для покращення доступності і контролю порядку навігації.

</details>

<details>
<summary>93. Як зробити зображення доступними для всіх користувачів?</summary>

#### HTML

1. **Атрибут alt** — короткий опис змісту зображення:

```html
<img src="logo.png" alt="Логотип компанії" />
```

2. **Порожній alt=""** — для декоративних зображень, щоб екранні читачі їх
   ігнорували.

3. **Текстова альтернатива для складних графіків або діаграм** — через
   `<figcaption>` або окремий опис.

4. **Контрастність та розмір** — зображення повинні бути чіткими і читабельними.

5. **Не покладатися тільки на колір** — важлива додаткова інформація для людей з
   порушеннями зору.

Це забезпечує доступність і кращий UX для користувачів з обмеженими
можливостями.

</details>

<details>
<summary>94. Які техніки оптимізації HTML допомагають у SEO?</summary>

#### HTML

- Використання семантичних тегів (`<header>`, `<article>`, `<nav>`, `<footer>`).

- Коректна структура заголовків (`<h1>–<h6>`).

- Мета-теги: `title`, `meta description`, `viewport`.

- Атрибути `alt` для зображень.

- Чистий і валідний `HTML` без дублікатів.

- Використання структурованих даних (`Schema.org`).

- Оптимізація швидкості завантаження (мінімізація `DOM`, `lazy-load`).

</details>

<details>
<summary>95. Що таке семантичний HTML і яку роль він відіграє у SEO?</summary>

#### HTML

- Семантичний HTML — це використання тегів за їхнім змістовим призначенням
  (`<header>`, `<main>`, `<article>`, `<section>`, `<nav>`, `<footer>`, а не
  `<div>` всюди).

- Це робить структуру сторінки зрозумілішою для браузерів, пошукових систем і
  `assistive`-технологій.

- Для `SEO` це критично: пошуковики краще розпізнають ієрархію контенту,
  визначають головні частини сторінки та підвищують релевантність у видачі.

Семантична розмітка = краща доступність + зрозуміла структура + підсилення SEO.

</details>

<details>
<summary>96. Яке значення мають теги заголовків h1 – h6 для SEO?</summary>

#### HTML

- `<h1>` — головний заголовок сторінки, має бути один; сигналізує пошуковикам
  про основну тему.

- `<h2>–<h3>` — підзаголовки, що структурують контент і допомагають пошуковим
  системам зрозуміти ієрархію.

- `<h4>–<h6>` — деталізація дрібніших розділів.

- Використання ключових слів у заголовках покращує релевантність.

- Правильна ієрархія покращує доступність і юзабіліті, що також враховується
  пошуковими системами.

Заголовки = «карта сторінки» для SEO й користувачів.

</details>

<details>
<summary>97. Як структуровані дані (Schema.org) впливають на SEO та чому їх варто використовувати?</summary>

#### HTML

- Структуровані дані — це спеціальна розмітка (JSON-LD, microdata, RDFa), яка
  пояснює пошуковим системам значення контенту (напр. продукт, стаття, подія).

- Завдяки схемам пошуковики можуть показувати rich snippets: рейтинг, ціну, FAQ,
  дату публікації тощо.

- Це покращує CTR (користувачі частіше клікають по результату).

- Вони не напряму підвищують рейтинг, але допомагають пошуковим системам краще
  індексувати сторінку та зробити її більш привабливою у видачі.

#### Приклад JSON-LD для статті:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Як оптимізувати HTML для SEO",
    "author": { "@type": "Person", "name": "Іван Іванов" },
    "datePublished": "2025-08-18",
    "publisher": {
      "@type": "Organization",
      "name": "MySite"
    }
  }
</script>
```

</details>

<details>
<summary>98. Які найкращі практики використання HTML допомагають у SEO-оптимізації сайту?</summary>

#### HTML

- Використовувати семантичну розмітку (`<header>`, `<main>`, `<article>`,
  `<section>`).

- Один `<h1>` на сторінку, чітка ієрархія заголовків.

- Заповнювати `title` і `meta description` з ключовими словами.

- Додавати `alt` для зображень.

- Оптимізувати URL-адреси (короткі, зрозумілі, з ключовими словами).

- Використовувати структуровані дані (`Schema.org`).

- Уникати дублювання контенту, застосовувати `canonical`.

- Забезпечувати швидке завантаження (`lazy-loading`, мінімізація `DOM`).

- Робити HTML доступним: `aria`-атрибути, правильні форми, семантичні елементи.

Правильний `HTML` = краща індексація + зручність для користувача + кращі позиції
у видачі.

</details>

<details>
<summary>99. Способи покращення продуктивності веб-сторінки під час використання HTML?</summary>

#### HTML

- Мінімізувати HTML, CSS, JS (видалити пробіли, коментарі).

- Використовувати gzip/brotli стиснення на сервері.

- Кешування (HTTP headers, Service Worker).

- Critical CSS inline → решта асинхронно.

- Ледаче завантаження (loading="lazy") для зображень/iframe.

- Використання CDN для статичних ресурсів.

- Оптимізувати DOM: мінімальна кількість елементів, уникати глибокої
  вкладеності.

- Використовувати атрибути async/defer для скриптів:

```html
<script src="script.js" defer></script>
<script src="analytics.js" async></script>
```

Кожен з цих кроків покращує швидкість завантаження та взаємодії користувача.

</details>

<details>
<summary>100. Що таке категорії контенту в HTML5?</summary>

#### HTML

Категорії контенту в HTML5 — це класифікація елементів за їхньою роллю та
способом використання. Основні категорії:

#### Головні категорії:

- **Flow content** — більшість елементів, які можуть з'являтися у `<body>` (p,
  div, span, h1-h6).

- **Sectioning content** — створюють розділи в документі (article, section, nav,
  aside).

- **Heading content** — заголовки (h1-h6).

- **Phrasing content** — текст та inline-елементи (a, span, strong, em).

- **Embedded content** — зовнішній контент (img, video, audio, iframe).

- **Interactive content** — елементи для взаємодії (button, input, textarea,
  select).

#### Спеціальні категорії:

- **Metadata content** — елементи у `<head>` (title, meta, link, script).

- **Form-associated content** — елементи форм (input, button, select, textarea).

Розуміння категорій допомагає правильно структурувати HTML та дотримуватись
стандартів валідності.

</details>

<details>
<summary>101. Що таке marquee у HTML?</summary>

#### HTML

- `<marquee>` — застарілий тег, який створював рухомий текст або зображення на
  веб-сторінці.

- Елемент автоматично прокручував контент горизонтально або вертикально.

#### Приклад:

```html
<marquee direction="left" behavior="scroll"
  >Рухомий текст зліва направо</marquee
>
```

#### Чому застарілий:

- Поганий UX — відволікає та дратує користувачів.
- Проблеми з доступністю — ускладнює читання для людей з дислексією.
- Не підтримується в HTML5 стандарті.

**Альтернатива:** CSS animations або JavaScript для створення контрольованих
анімацій.

</details>

<details>
<summary>102. Що таке властивість valueAsNumber?</summary>

#### HTML

Властивість `valueAsNumber` повертає значення елемента форми як число. Воно
доступне для елементів, таких як `<input>` з типами `number`, `range` та іншими,
де очікується числове введення. Якщо значення не число, властивість повертає
`NaN`.

#### Приклад:

```html
<input type="number" id="age" value="25" />
<script>
  const input = document.getElementById('age');
  console.log(input.valueAsNumber); // 25 (як число)
  console.log(input.value); // "25" (як рядок)
</script>
```

Це зручно для роботи з числовими розрахунками без додаткового перетворення
типів.

</details>

<details>
<summary>103. Навіщо використовується атрибут capture?</summary>

#### HTML

Атрибут capture використовується в елементах форми, таких як
`<input type="file">`, для запуску камери або мікрофона замість вибору файлу з
пам'яті пристрою. Це дозволяє користувачу безпосередньо зробити фото або
записати аудіо.

#### Приклад використання атрибута `capture`:

```html
<form>
  <label for="camera">Зробити фото:</label>
  <input
    type="file"
    id="camera"
    name="camera"
    accept="image/*"
    capture="camera"
  />

  <label for="audio">Записати звук:</label>
  <input
    type="file"
    id="audio"
    name="audio"
    accept="audio/*"
    capture="microphone"
  />

  <button type="submit">Відправити</button>
</form>
```

Особливо корисно для мобільних додатків, де потрібен швидкий доступ до камери чи
мікрофона.

</details>

<details>
<summary>104. Для чого використовується атрибут decoding enterkeyhint novalidate inputmode pattern?</summary>

#### HTML

- **`decoding`**: Визначає, як браузер має обробляти зображення:

  ```html
  <img src="photo.jpg" decoding="async" alt="Фото" />
  ```

  Значення: `sync`, `async`, `auto`

- **`enterkeyhint`**: Дає браузеру підказку, що робити при натисканні Enter на
  віртуальній клавіатурі:

  ```html
  <input type="text" enterkeyhint="search" placeholder="Пошук..." />
  ```

  Значення: `enter`, `done`, `go`, `next`, `previous`, `search`, `send`

- **`novalidate`**: Вимикає валідацію форми при її відправці:

  ```html
  <form novalidate>
    <input type="email" required />
  </form>
  ```

- **`inputmode`**: Вказує тип введення для віртуальної клавіатури:

  ```html
  <input type="text" inputmode="numeric" placeholder="Телефон" />
  ```

- **`pattern`**: Задає регулярний вираз для перевірки введеного значення:
  ```html
  <input
    type="text"
    pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
    placeholder="123-456-7890"
  />
  ```

</details>

<details>
<summary>105. Що таке і навіщо потрібний атрибут rel="nofollow" у HTML?</summary>

#### HTML

Атрибут `rel="nofollow"` вказує пошуковим системам не передавати "link juice"
(вагу посилання) на цільову сторінку.

#### Використання:

```html
<a href="https://example.com" rel="nofollow">Зовнішнє посилання</a>
```

#### Навіщо потрібен:

- **SEO-контроль** — не передавати рейтинг на ненадійні або рекламні сайти.
- **Спам-захист** — запобігання зловживанню коментарями для просування сайтів.
- **Реклама** — позначення оплачених посилань для відповідності вимогам
  пошуковиків.

#### Додаткові значення rel:

- `rel="noopener"` — безпека при `target="_blank"`
- `rel="noreferrer"` — не передавати referrer
- `rel="sponsored"` — для рекламних посилань

</details>

<details>
<summary>106. Навіщо потрібен атрибут autocomplete?</summary>

#### HTML

Атрибут autocomplete в HTML використовується для вказівки браузеру, чи має він
автоматично заповнювати поля форми збереженими даними (наприклад, іменем,
адресою, електронною поштою). Він може бути включений або вимкнений для окремих
полів форми або для всієї форми.

#### Значення:

- `on` — дозволяє автозаповнення
- `off` — вимикає автозаповнення
- Специфічні значення: `name`, `email`, `current-password`, `new-password`,
  `tel`, `address-line1` тощо

#### Приклади:

```html
<form autocomplete="on">
  <input type="text" name="name" autocomplete="name" placeholder="Ім'я" />
  <input type="email" name="email" autocomplete="email" placeholder="Email" />
  <input type="password" name="password" autocomplete="current-password" />
</form>
```

Покращує UX — користувачі швидше заповнюють форми завдяки автопідказкам
браузера.

</details>

<details>
<summary>107. Як можна приховати елемент розмітки без використання CSS і JS?</summary>

#### HTML

Елемент можна приховати за допомогою атрибуту `hidden`:

```html
<div hidden>Цей елемент прихований</div>
```

#### Особливості атрибута `hidden`:

- Це булевий атрибут — його наявність робить елемент невидимим.
- Елемент повністю видаляється з візуального потоку.
- Семантично означає, що контент зараз не релевантний.
- Еквівалент CSS `display: none`.

#### Порівняння з іншими способами:

```html
<!-- Атрибут hidden -->
<p hidden>Прихований текст</p>

<!-- Можна змінювати через JavaScript -->
<script>
  document.querySelector('p').hidden = false; // показати
</script>
```

Це найпростіший спосіб приховати контент без CSS, особливо для динамічних змін
через JavaScript.

</details>

<details>
<summary>108. Що таке Geolocation API у браузері та як його застосовують у веброзробці?</summary>

#### HTML

- Geolocation API — вбудований у браузери інтерфейс, який дозволяє отримати
  географічне положення користувача (координати широти й довготи).

- Використання потребує згоди користувача.

- Застосовується для карт, локальних сервісів, геотаргетингу.

#### Приклад:

```javascript
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    position => {
      console.log('Lat:', position.coords.latitude);
      console.log('Lng:', position.coords.longitude);
    },
    error => {
      console.error('Помилка:', error.message);
    }
  );
}
```

#### Основні методи:

- `getCurrentPosition()` — поточна позиція
- `watchPosition()` — відстеження змін позиції
- `clearWatch()` — зупинка відстеження

Підтримується більшістю сучасних браузерів, але точність залежить від пристрою
(GPS, Wi-Fi, IP).

</details>

<details>
<summary>109. Як у вебдодатках використовувати Local Storage і Session Storage?</summary>

#### HTML

Це частина Web Storage API для зберігання даних у браузері.

- `localStorage` — зберігає дані безстроково (доки користувач не очистить вручну
  або додаток не видалить).

- `sessionStorage` — зберігає дані тільки в межах поточної сесії браузера
  (закрив вкладку = дані зникають).

#### Приклад:

```javascript
// Local Storage
localStorage.setItem('username', 'Viktor');
console.log(localStorage.getItem('username')); // Viktor
localStorage.removeItem('username');

// Session Storage
sessionStorage.setItem('theme', 'dark');
console.log(sessionStorage.getItem('theme')); // dark
sessionStorage.clear();
```

#### Використання:

- `Local Storage` → збереження налаштувань, токенів, кешованих даних.

- `Session Storage` → тимчасові дані (форма, стан сторінки).

Обидва працюють тільки з рядками (для об'єктів треба `JSON.stringify` /
`JSON.parse`).

</details>

<details>
<summary>110. Як працює Drag and Drop API у браузері та де його застосовують?</summary>

#### HTML

Drag and Drop API дозволяє перетягувати елементи на сторінці та обробляти їх
"скидання".

#### Ключові події:

- `dragstart` — початок перетягування.

- `dragover` — об'єкт знаходиться над зоною скидання (потрібно викликати
  event.preventDefault()).

- `drop` — елемент скинуто в зону.

- `dragend` — завершення перетягування.

#### Приклад:

```html
<div id="drag" draggable="true">Перетягни мене</div>
<div id="drop" style="width:200px;height:200px;border:1px solid black;">
  Зона скидання
</div>

<script>
  const drag = document.getElementById('drag');
  const drop = document.getElementById('drop');

  drag.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', drag.id);
  });

  drop.addEventListener('dragover', e => {
    e.preventDefault(); // дозволяє скидання
  });

  drop.addEventListener('drop', e => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text');
    const el = document.getElementById(id);
    drop.appendChild(el);
  });
</script>
```

#### Використання:

- Реалізація `drag-and-drop` інтерфейсів (сортування списків, kanban-дошки).

- Завантаження файлів через "перетягни й скинь".

- Інтерактивні UI (редактори, кастомізація блоків).

</details>

<details>
<summary>111. Що таке Fullscreen API у браузері та для чого його застосовують?</summary>

#### HTML

- Fullscreen API дозволяє елементу сторінки (відео, зображення, canvas, div)
  переходити в повноекранний режим.

- Використовується для медіа (відеоплеєри, презентації, ігри, карти).

- Підвищує зручність користувача, коли потрібна максимальна концентрація на
  контенті.

#### Приклад:

```javascript
const elem = document.documentElement;

// Увійти в повноекранний режим
function openFullscreen() {
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  }
}

// Вийти з повноекранного режиму
function closeFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  }
}
```

Використовується разом із подіями `fullscreenchange`, щоб реагувати на зміни
стану.

</details>

<details>
<summary>112. Що таке ApplicationCache в HTML5?</summary>

#### HTML

**`ApplicationCache`** в HTML5 — це механізм для офлайн-доступу до веб-додатків.
Він дозволяє зберігати ресурси веб-сторінки (HTML, CSS, JavaScript, зображення)
в кеші браузера, що дає змогу користувачам працювати з додатком без
інтернет-з'єднання.

#### Особливості:

- Використовувався для створення офлайн-додатків
- Визначався через атрибут `manifest` в HTML
- Дозволяв кешувати статичні ресурси

#### Приклад застарілого використання:

```html
<html manifest="cache.appcache">
  <head>
    <title>Офлайн додаток</title>
  </head>
  <body>
    ...
  </body>
</html>
```

**Важливо:** Відповідно до специфікації HTML5, цей механізм був застарілий і
замінений новими API, такими як **Service Workers**, які надають більш гнучкі
можливості для офлайн-функціональності.

</details>

<details>
<summary>113. Як обробляти події, що надходять від сервера, на фронтенді?</summary>

#### HTML

Для взаємодії з подіями сервера зазвичай використовують WebSocket або
Server-Sent Events (SSE).

#### 1. Server-Sent Events (SSE) — для односпрямованих подій від сервера:

```javascript
const eventSource = new EventSource('/events');

eventSource.onmessage = event => {
  console.log('Нові дані від сервера:', event.data);
};

eventSource.onerror = err => {
  console.error('Помилка SSE:', err);
};
```

#### 2. WebSocket — для двосторонньої взаємодії:

```javascript
const socket = new WebSocket('ws://localhost:8080');

socket.onopen = () => {
  console.log('З'єднання встановлено');
};

socket.onmessage = (event) => {
  console.log('Повідомлення від сервера:', event.data);
};

socket.onerror = (err) => {
  console.error('Помилка WebSocket:', err);
};
```

#### Використання:

- Реал-time оновлення UI (чат, сповіщення, лічильники).

- Стримінг даних без перезавантаження сторінки.

- Двостороннє спілкування між клієнтом і сервером.

</details>

<details>
<summary>114. Як відобразити сторінку кількома мовами?</summary>

#### HTML

Можна зробити кількамовність так:

1. **Окремі HTML-файли для кожної мови:**

```html
<!-- index-en.html -->
<html lang="en">
  <head>
    <title>Welcome</title>
  </head>
  <body>
    <h1>Welcome to our site</h1>
  </body>
</html>

<!-- index-uk.html -->
<html lang="uk">
  <head>
    <title>Ласкаво просимо</title>
  </head>
  <body>
    <h1>Ласкаво просимо на наш сайт</h1>
  </body>
</html>
```

2. **Серверна локалізація:**

Сервер віддає потрібну мову залежно від налаштувань користувача чи URL (/en/,
/uk/).

3. **JavaScript + JSON-файли перекладів:**

Підвантаження текстів без перезавантаження сторінки (часто у SPA).

4. **Фреймворки з i18n:**

react-i18next, vue-i18n, Angular i18n.

**Важливо:** Для базового HTML обов'язково вказувати `lang="..."` і
`meta charset="UTF-8"`.

</details>

<details>
<summary>115. Як правильно задавати і обробляти кодування символів у HTML?</summary>

#### HTML

- Використовують UTF-8, щоб підтримувати всі символи (латиницю, кирилицю, емодзі
  тощо).

- Вказують у `<head>` сторінки:

```html
<meta charset="UTF-8" />
```

#### Додаткові рекомендації:

- Сервер також має надсилати правильний заголовок:

  ```
  Content-Type: text/html; charset=UTF-8
  ```

- Використання UTF-8 запобігає появі "кракозябр" при відображенні тексту.

**Краща практика:** всі HTML, CSS і JS файли зберігати в UTF-8 без BOM (Byte
Order Mark).

#### Приклад правильного кодування:

```html
<!DOCTYPE html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <title>Український текст відображається правильно</title>
  </head>
  <body>
    <p>Привіт! Це українські символи: ї, є, ґ, щ</p>
  </body>
</html>
```

</details>

<details>
<summary>116. Що робить атрибут lang у HTML і чому він важливий?</summary>

#### HTML

Атрибут lang визначає мову контенту елемента або сторінки:

```html
<html lang="uk">
  <body>
    <p>Це український текст</p>
    <p lang="en">This is English text</p>
  </body>
</html>
```

#### Важливість:

- **SEO:** Допомагає пошуковим системам і поліпшує ранжування.

- **Доступність:** Читачі екрану правильно озвучують текст з правильною вимовою.

- **Локалізація:** Впливає на правильне відображення шрифтів і форматування дат,
  чисел.

- **Браузерні функції:** Автоматичні перекладачі працюють точніше.

#### Приклади використання:

```html
<!-- Основна мова документа -->
<html lang="uk">
  <!-- Окремі фрагменти іншими мовами -->
  <blockquote lang="en">"To be or not to be, that is the question"</blockquote>

  <!-- Для багатомовних сайтів -->
  <div lang="fr">Bonjour le monde!</div>
</html>
```

**Краща практика:** завжди вказувати lang на `<html>` і при необхідності на
внутрішніх елементах з іншою мовою.

</details>

<details>
<summary>117. Як у HTML враховувати підтримку напрямку тексту LTR (зліва направо) та RTL (справа наліво)?</summary>

#### HTML

**Використовують атрибут dir:**

- `dir="ltr"` — текст зліва направо (за замовчуванням для більшості мов).

- `dir="rtl"` — текст справа наліво (арабська, іврит).

#### Приклади:

```html
<p dir="ltr">Hello, world! → (зліва направо)</p>
<p dir="rtl">مرحبا بالعالم ← (справа наліво)</p>

<!-- Змішаний контент -->
<div dir="rtl">
  <p>نص عربي</p>
  <p dir="ltr">English text in RTL context</p>
</div>
```

#### Комбінування з CSS:

```css
[dir='rtl'] {
  text-align: right;
}

[dir='rtl'] .menu {
  float: right;
}
```

#### Практичні міркування:

- Можна ставити на `<html>` або окремі елементи.

- Потрібно поєднувати з CSS, якщо є специфічне вирівнювання чи флоати
  (text-align, float, margin).

- Враховують при мультимовних сайтах, щоб макет і UI не ламалися.

**Краща практика:** для мультимовних проєктів задавати lang + dir на кореневому
елементі й контролювати локально там, де мова змінюється.

</details>

<details>
<summary>118. Яке значення та користь має використання "хлібних крихт" (breadcrumbs) у веб-навігації?</summary>

#### HTML

- **Покращує юзабіліті:** користувач бачить своє місце в ієрархії сайту.

- **Швидка навігація:** дозволяє швидко перейти на вищі рівні структури.

- **Зменшує кліки:** скорочує кількість кліків до потрібної сторінки.

- **SEO-переваги:** має позитивний вплив на SEO (пошуковики краще розуміють
  структуру сайту).

#### Приклад HTML для breadcrumbs:

```html
<nav aria-label="Breadcrumb">
  <ol class="breadcrumb">
    <li><a href="/">Головна</a></li>
    <li><a href="/category">Категорія</a></li>
    <li><a href="/category/subcategory">Підкategорія</a></li>
    <li aria-current="page">Поточна сторінка</li>
  </ol>
</nav>
```

#### Структуровані дані для SEO:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Головна",
        "item": "https://example.com/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Категорія",
        "item": "https://example.com/category"
      }
    ]
  }
</script>
```

Breadcrumbs особливо корисні для великих сайтів з глибокою ієрархією контенту.

</details>

<details>
<summary>119. Як створити розсувне (collapsible/accordion) меню в HTML?</summary>

#### HTML

#### Метод 1: Через теги `<details>` і `<summary>` (нативний HTML):

```html
<details>
  <summary>Services</summary>
  <ul>
    <li><a href="#">Web Development</a></li>
    <li><a href="#">UI/UX Design</a></li>
    <li><a href="#">SEO</a></li>
  </ul>
</details>

<details>
  <summary>Products</summary>
  <ul>
    <li><a href="#">Product A</a></li>
    <li><a href="#">Product B</a></li>
  </ul>
</details>
```

#### Метод 2: CSS-only accordion:

```html
<div class="accordion">
  <input type="checkbox" id="section1" />
  <label for="section1">Section 1</label>
  <div class="content">
    <p>Content for section 1</p>
  </div>

  <input type="checkbox" id="section2" />
  <label for="section2">Section 2</label>
  <div class="content">
    <p>Content for section 2</p>
  </div>
</div>

<style>
  .accordion input[type='checkbox'] {
    display: none;
  }

  .accordion .content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
  }

  .accordion input[type='checkbox']:checked + label + .content {
    max-height: 200px;
  }
</style>
```

#### Переваги `<details>`/`<summary>`:

- Нативна підтримка браузерами
- Доступність "з коробки"
- Не потребує JavaScript
- Семантично правильний

</details>

<details>
<summary>120. Яка різниця між вбудовуванням медіафайлів у HTML і посиланням на них?</summary>

#### HTML

**Вбудовування медіа:**

Медіа відтворюється прямо на сторінці через теги (`<img>`, `<audio>`, `<video>`,
`<iframe>`). Користувач взаємодіє з контентом без переходу на інший ресурс.

```html
<!-- Вбудовані медіафайли -->
<img src="photo.jpg" alt="Фотографія" />
<video controls>
  <source src="video.mp4" type="video/mp4" />
</video>
<audio controls>
  <source src="music.mp3" type="audio/mpeg" />
</audio>
```

**Посилання на медіа:**

Файл відкривається або завантажується після кліку по `<a href="...">`. Контент
не відтворюється безпосередньо у сторінці.

```html
<!-- Посилання на медіафайли -->
<a href="document.pdf">Завантажити PDF</a>
<a href="photo.jpg">Переглянути фото</a>
<a href="video.mp4" download>Завантажити відео</a>
```

**Порівняння:**

| Критерій      | Вбудовування                     | Посилання                      |
| ------------- | -------------------------------- | ------------------------------ |
| **UX**        | Безшовний перегляд               | Потребує переходу/завантаження |
| **Швидкість** | Повільніше завантаження сторінки | Швидша сторінка                |
| **Трафік**    | Завантажується автоматично       | Завантажується на вимогу       |
| **Контроль**  | Повний контроль відтворення      | Залежить від браузера          |

**Висновок:** Вбудовування — зручно для інтерактивності, посилання — легше для
швидких завантажень або коли не потрібен попередній перегляд.

</details>

<details>
<summary>121. Що таке Web Components у фронтенд-розробці та для чого їх використовують?</summary>

#### HTML

Web Components — це нативна технологія браузера для створення повторно
використовуваних, інкапсульованих UI-компонентів без залежності від фреймворків.
Складаються з трьох частин:

1. **Custom Elements** — визначення власних HTML-тегів (`<my-button>`).

2. **Shadow DOM** — ізоляція стилів і DOM-компонента від решти сторінки.

3. **HTML Templates** — заготовки розмітки (`<template>`).

#### Приклад:

```html
<template id="my-card">
  <style>
    .card {
      border: 1px solid #ccc;
      padding: 10px;
      border-radius: 8px;
    }
  </style>
  <div class="card"><slot></slot></div>
</template>

<script>
  class MyCard extends HTMLElement {
    constructor() {
      super();
      const template = document.getElementById('my-card').content;
      const shadow = this.attachShadow({ mode: 'open' });
      shadow.appendChild(template.cloneNode(true));
    }
  }
  customElements.define('my-card', MyCard);
</script>

<my-card>Привіт! Я веб-компонент</my-card>
```

#### Використання:

- Створення UI-бібліотек без прив'язки до React/Angular/Vue.

- Інкапсуляція стилів (не конфліктують з глобальними CSS).

- Можна повторно використовувати між різними проєктами чи фреймворками.

</details>

<details>
<summary>122. Що таке Shadow DOM у вебкомпонентах і як його правильно застосовувати?</summary>

#### HTML

Shadow DOM — це механізм інкапсуляції DOM і стилів усередині вебкомпонента. Він
приховує внутрішню реалізацію від зовнішнього коду та запобігає конфліктам
CSS/JS.

#### Ключові властивості:

- Створюється через `element.attachShadow({ mode: 'open' | 'closed' })`.

- Має власне дерево елементів, відокремлене від основного DOM.

- Стилі в Shadow DOM не впливають на глобальні стилі і навпаки.

#### Приклад:

```html
<div id="host"></div>

<script>
  const host = document.getElementById('host');
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      p { color: red; }
    </style>
    <p>Цей текст червоний лише в Shadow DOM</p>
  `;
</script>
```

#### Режими:

- `mode: 'open'` — можна отримати доступ до shadow DOM через
  `element.shadowRoot`
- `mode: 'closed'` — shadow DOM повністю прихований від зовнішнього коду

Використовується головним чином у Web Components, щоб створювати незалежні й
повторно використовувані UI-елементи.

</details>

<details>
<summary>123. Як створити власний HTML-елемент (Custom Element) у браузері?</summary>

#### HTML

Для створення кастомного елемента використовується API Custom Elements:

1. Створюємо клас, що наслідує `HTMLElement`.

2. Реєструємо його через `customElements.define()`.

3. Використовуємо у розмітці як звичайний тег.

#### Приклад:

```html
<script>
  class MyButton extends HTMLElement {
    constructor() {
      super();
      this.innerHTML = `<button>Click me!</button>`;
    }

    connectedCallback() {
      console.log('Element додано до DOM');
      this.addEventListener('click', this.handleClick);
    }

    disconnectedCallback() {
      console.log('Element видалено з DOM');
      this.removeEventListener('click', this.handleClick);
    }

    handleClick = () => {
      alert('Custom button clicked!');
    };
  }

  customElements.define('my-button', MyButton);
</script>

<my-button></my-button>
```

#### Lifecycle методи:

- `connectedCallback()` — викликається при додаванні до DOM
- `disconnectedCallback()` — викликається при видаленні з DOM
- `attributeChangedCallback()` — викликається при зміні атрибутів

Браузер розпізнає `<my-button>` як нативний елемент.

Можна додати `Shadow DOM` для інкапсуляції стилів.

</details>

<details>
<summary>124. Що таке HTML-шаблони template і як їх використовують у веброзробці?</summary>

#### HTML

`<template>` — це тег для визначення розмітки, яка не відображається на сторінці
до моменту її програмного клонування. Використовується разом із JavaScript для
динамічного створення контенту.

#### Особливості:

- Вміст шаблона не рендериться при завантаженні сторінки.

- Можна клонувати через `template.content.cloneNode(true)`.

- Часто застосовується у Web Components та при динамічному рендерингу списків.

#### Приклад:

```html
<template id="item-template">
  <li class="item">
    <h3 class="title"></h3>
    <p class="description"></p>
  </li>
</template>

<ul id="list"></ul>

<script>
  const template = document.getElementById('item-template');
  const list = document.getElementById('list');

  const items = [
    { title: 'Item 1', description: 'Description 1' },
    { title: 'Item 2', description: 'Description 2' },
  ];

  items.forEach(item => {
    const clone = template.content.cloneNode(true);
    clone.querySelector('.title').textContent = item.title;
    clone.querySelector('.description').textContent = item.description;
    list.appendChild(clone);
  });
</script>
```

#### Використання:

- Динамічне додавання елементів у DOM.

- Інкапсульована розмітка для вебкомпонентів.

- Повторне використання UI-блоків без дублювання коду.

- Шаблони для генерації контенту на основі даних.

</details>

<details>
<summary>125. Як Flexbox і Grid допомагають створювати адаптивні макети?</summary>

#### HTML

**Flexbox**

Дозволяє легко вирівнювати та розподіляти простір між елементами в одному
напрямку (рядок або колонка). Ідеально для адаптивних меню, рядків карток,
елементів навігації.

```html
<div class="flex-container">
  <div class="flex-item">Item 1</div>
  <div class="flex-item">Item 2</div>
  <div class="flex-item">Item 3</div>
</div>

<style>
  .flex-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
  }

  .flex-item {
    flex: 1 1 300px; /* grow, shrink, basis */
    margin: 10px;
  }
</style>
```

**Grid**

Дозволяє будувати двовимірні макети (рядки + колонки) і керувати складними
структурами сторінки. Легко змінювати кількість колонок під різні екрани через
медіа-запити.

```html
<div class="grid-container">
  <div class="grid-item">Header</div>
  <div class="grid-item">Sidebar</div>
  <div class="grid-item">Main</div>
  <div class="grid-item">Footer</div>
</div>

<style>
  .grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
  }

  /* Адаптивність через медіа-запити */
  @media (max-width: 768px) {
    .grid-container {
      grid-template-columns: 1fr;
    }
  }
</style>
```

**Переваги для адаптивності:**

- Автоматичне перенесення елементів на новий рядок
- Гнучкий розподіл простору
- Легка зміна макету через медіа-запити
- Менше коду порівняно з float-основними рішеннями

Обидва підходи роблять макети гнучкими і дозволяють створювати адаптивний дизайн
без складних обхідних рішень.

</details>

<details>
<summary>126. Що таке валідація? Які типи перевірок HTML-документа ви знаєте?</summary>

#### HTML

Валідація — це процес перевірки коректності коду HTML-документа відповідно до
стандартів W3C.

**Типи перевірок:**

1. **Синтаксична валідація** — перевірка правильності синтаксису та структури
   тегів.
2. **Валідація атрибутів** — перевірка правильності та відповідності
   використаних атрибутів.
3. **Валідація доступності (Accessibility)** — перевірка на відповідність
   стандартам доступності, наприклад WCAG.
4. **Перевірка сумісності** — оцінка роботи коду в різних браузерах.
5. **SEO-валідація** — перевірка оптимізації документа для пошукових систем.
6. **Перевірка швидкодії** — аналіз завантаження та продуктивності.

**Приклади помилок:**

```html
<!-- Синтаксична помилка: незакритий тег -->
<div>
  <p>Text</p>
</div>

<!-- Помилка атрибута: неіснуючий атрибут -->
<img src="photo.jpg" invalidattr="value" />

<!-- Доступність: відсутній alt -->
<img src="photo.jpg" />
```

**Інструменти валідації:**

- W3C Markup Validator
- HTMLHint (лінтер)
- Lighthouse (доступність і SEO)
- axe DevTools

**Валідний HTML** = краща сумісність, доступність і SEO.

</details>

<details>
<summary>127. Основні етапи перевірок валідності HTML-документа?</summary>

#### HTML

**Основні етапи перевірки валідності:**

1. **Перевірка синтаксису** — аналіз тегів, вкладеності та закриття.
2. **Перевірка атрибутів** — відповідність атрибутів специфікації.
3. **Перевірка DocType** — відповідність документа заявленому типу.
4. **Перевірка доступності** — наявність елементів для підтримки доступності
   (alt, aria).
5. **Перевірка семантики** — правильне використання семантичних тегів.
6. **Перевірка посилань** — аналіз працездатності та коректності URL.

#### Детальний процес:

**Етап 1: Структурна валідація**

```html
<!DOCTYPE html>
<!-- Правильний DOCTYPE -->
<html lang="uk">
  <!-- Мова документа -->
  <head>
    <meta charset="UTF-8" />
    <!-- Кодування -->
    <title>Заголовок</title>
  </head>
  <body>
    <!-- Правильно вкладені елементи -->
  </body>
</html>
```

**Етап 2: Семантична валідація**

- Використання відповідних тегів (`<header>`, `<main>`, `<article>`)
- Правильна ієрархія заголовків (h1-h6)
- Коректні форми та їх елементи

**Етап 3: Доступність**

- Alt-тексти для зображень
- ARIA-атрибути де потрібно
- Табуляційна навігація

**Етап 4: Продуктивність і SEO**

- Оптимізовані зображення
- Мета-теги для SEO
- Валідні посилання

</details>

<details>
<summary>128. Якими способами перевіряють HTML на валідність і коректність?</summary>

#### HTML

Основні способи перевірки:

1. **Онлайн валідатори:**

- **W3C Markup Validator** (validator.w3.org) — офіційний сервіс для перевірки
  синтаксису й стандартів
- **HTML5 Validator** — перевірка специфічно для HTML5

2. **Редакторні плагіни та лінтери:**

- **HTMLHint** — інтегрується в CI/CD або редактор
- **ESLint з HTML плагінами**
- **Prettier** — форматування коду

3. **Браузерні інструменти:**

- **DevTools** — виявляють помилки розмітки в консолі
- **Elements панель** — показує структуру та помилки DOM

4. **Автоматизоване тестування:**

- **Lighthouse** — комплексна перевірка (accessibility, SEO, performance)
- **axe DevTools** — спеціалізовано на доступності
- **WAVE** — онлайн інструмент для accessibility

5. **CI/CD інтеграція:**

```json
{
  "scripts": {
    "lint:html": "htmlhint src/**/*.html",
    "validate": "html-validate src/**/*.html"
  }
}
```

6. **Командні інструменти:**

- **html-validate** — CLI валідатор
- **htmllint** — лінтер для HTML

#### Приклад перевірки:

```bash
# Перевірка через HTMLHint
npx htmlhint index.html

# Автоматична перевірка в pipeline
npm run lint:html
```

**Валідний HTML** = краща сумісність, доступність і SEO.

</details>

<details>
<summary>129. Як перевірити, що HTML-код відповідає стандартам і найкращим практикам?</summary>

#### HTML

#### Комплексний підхід до перевірки:

1. **Валідатори:**

- **W3C HTML Validator** для перевірки синтаксису
- **Nu Html Checker** — сучасний валідатор HTML5

2. **Лінтери:**

- **HTMLHint** з налаштованими правилами
- **ESLint** з плагінами для HTML

3. **Audits і аналіз:**

- **Chrome Lighthouse** → accessibility, SEO, performance
- **PageSpeed Insights** — Google аналіз продуктивності

4. **Accessibility тестування:**

- **axe DevTools** — найпопулярніший інструмент
- **WAVE** — онлайн accessibility валідатор
- **Colour Contrast Analyser** — перевірка контрастності

5. **Code review:**

- Внутрішні стандарти команди
- PR-рецензії з чеклістами
- Автоматичні коментарі від ботів

6. **CI/CD інтеграція:**

```yaml
# GitHub Actions приклад
- name: Validate HTML
  run: |
    npm install -g htmlhint
    htmlhint src/**/*.html

- name: Accessibility test
  run: |
    npm install -g @axe-core/cli
    axe src/**/*.html
```

7. **Чекліст найкращих практик:**

- Семантичні теги замість `<div>`
- Один `<h1>` на сторінку
- Alt-тексти для всіх зображень
- Правильна ієрархія заголовків
- Валідні форми з labels
- HTTPS і безпечні атрибути
- Мінімізований HTML для продакшену

Комбо автоматичних інструментів + ручне рев'ю = гарантія дотримання best
practices.

</details>

<details>
<summary>130. Якщо представити HTML5 як відкриту веб-платформу, з яких блоків він складається?</summary>

#### HTML

HTML5 як відкрита веб-платформа складається з наступних ключових блоків:

1. **Семантика**

Семантичні теги для структурування контенту:

- `<header>`, `<footer>`, `<main>`, `<article>`, `<section>`, `<nav>`, `<aside>`
- Покращують доступність та SEO

2. **Мультимедіа**

Нативна підтримка аудіо та відео:

- `<audio>`, `<video>` — без сторонніх плагінів
- `<track>` — субтитри та доступність
- Media API для програмного контролю

3. **Графіка**

Елементи для роботи з графікою:

- `<canvas>` — растрова графіка через JavaScript
- `<svg>` — векторна графіка
- WebGL для 3D графіки

4. **Сховище і офлайн**

API для локального зберігання даних:

- `localStorage`, `sessionStorage`
- `IndexedDB` — потужна NoSQL база даних
- `Service Workers` — офлайн функціональність
- `Cache API`

5. **Комунікації**

- `WebSocket` — реал-тайм двостороння комунікація
- `Server-Sent Events` — односпрямовані події від сервера
- `WebRTC` — peer-to-peer зв'язок
- `Fetch API` — сучасні HTTP запити

6. **Форми**

Розширені можливості форм:

- Нові типи `<input>` (email, url, date, color, range)
- Вбудована валідація
- `<datalist>` — автокомпліт

7. **Продуктивність**

API для оптимізації роботи:

- `Web Workers` — фонові обчислення
- `Intersection Observer` — ефективне відстеження видимості
- `Performance API` — моніторинг швидкодії

8. **Доступність**

- ARIA-атрибути для покращення доступності
- Семантичні ролі та стани
- Підтримка асистивних технологій

9. **Безпека**

- `Content Security Policy` (CSP)
- `Sandbox` атрибути
- Захищені контексти (HTTPS)

10. **Геолокація та пристрої**

- `Geolocation API`
- `Device Orientation API`
- `Vibration API`
- `Battery Status API`

Ця платформа забезпечує повноцінну екосистему для розробки сучасних веб-додатків
без залежності від сторонніх плагінів.

</details>

<details>
<summary>131. Що таке Living Standard і як HTML підтримує цей підхід?</summary>

#### HTML

- Living Standard — модель розвитку веб-стандартів, коли специфікація постійно
  оновлюється замість випуску фіксованих версій.

- HTML (через WHATWG) слідує цій моделі: нові елементи, атрибути й API додаються
  без формальних великих версій, а застарілі депрекейтяться поступово.

#### Переваги:

- Завжди актуальна специфікація.

- Менше застарілих версій у браузерах.

- Швидке впровадження нових технологій (Web Components, `<dialog>`, API для
  медіа).

- Браузери синхронізуються з Living Standard, забезпечуючи сумісність і
  інновації одночасно.

HTML Living Standard гарантує, що розробники працюють із сучасним, підтримуваним
і сумісним кодом.

</details>

<details>
<summary>132. Як HTML еволюціонує у контексті веб-стандартів і нових технологій?</summary>

#### HTML

- **Семантика та структура:** додаються нові теги для сучасних інтерфейсів
  (`<main>`, `<dialog>`, `<template>`).

- **Інтерактивність:** тісна інтеграція з JavaScript API (Web Components,
  Canvas, WebRTC, Web Audio).

- **Безпека:** нові атрибути і механізми (CSP, sandbox, form validation).

- **Доступність:** стандарти WAI-ARIA та краща підтримка скрінрідерів.

- **Мобільність і PWA:** API для офлайн-доступу, push-сповіщень, service
  workers.

- HTML оновлюється разом із CSS і JS стандартами, забезпечуючи сумісність,
  продуктивність і безпеку.

Коротко: HTML розвивається як частина екосистеми веб-стандартів, зберігаючи
сумісність і додаючи сучасні функції для UI, доступності та безпеки.

</details>

<details>
<summary>133. Які ключові зміни та нововведення з'явилися в HTML5.1 та HTML5.2?</summary>

#### HTML

- **HTML5.1 (2016):**

  - Нові семантичні теги: `<main>`, `<picture>`.

  - Покращення форм: `autocomplete`, `autofocus`, `required` та нові
    `input types`.

  - Додано підтримку `custom elements` (Web Components).

  - Поліпшення атрибутів для `accessibility` (hidden, tabindex).

  - Невеликі уточнення в DOM API і інтеграції з JavaScript.

- **HTML5.2 (2017):**

  - Нові теги та атрибути: `<dialog>` для модальних вікон, formaction для
    `<button>` та `<input>`.

  - Забезпечення безпечного використання `iframe:` `sandbox`, `allow` атрибути.

  - Покращення `ARIA` підтримки та `accessibility`.

  - Деякі застарілі елементи були депрекейтовані (`<menu>`, `<keygen>`).

  - Інтеграція з `Content Security Policy` (CSP) та нові механізми безпеки.

Кожне оновлення робить HTML більш семантичним, безпечним і дружнім до
доступності.

</details>

<details>
<summary>134. Які потенційні напрямки розвитку HTML можна очікувати у найближчому майбутньому?</summary>

#### HTML

- Більш тісна інтеграція з `Web Components` → спрощена кастомізація і повторне
  використання UI.

- Нові семантичні елементи для сучасних інтерфейсів (напр. `<dialog>`
  покращення, `<modal>`, `<carousel>` можливі).

- Покращена мультимедіа-підтримка → `Web Audio`, `WebRTC`, `3D/AR` контент без
  сторонніх плагінів.

- Більш потужні форми → нові `input types`, краща валідація і `accessibility`.

- Підтримка прогресивних веб-додатків (PWA) → офлайн, `push notifications`,
  фонова синхронізація.

- Інтеграція зі стандартами безпеки та конфіденційності → `CSP`,
  `cookie-less auth`, `sandboxing`.

- Оптимізація для мобільних і `low-power` пристроїв → легші елементи та
  оптимізовані API.

Загальний тренд: HTML стає більш семантичним, інтерактивним і безпечним, з
меншим залученням сторонніх бібліотек.

</details>

<details>
<summary>135. Які популярні CSS-фреймворки найчастіше інтегрують із HTML для швидкої розробки UI?</summary>

#### HTML

- `Bootstrap` → найпопулярніший, готові компоненти й grid-система.

- `Tailwind CSS` → утилітарний підхід, висока гнучкість.

- `Foundation (від Zurb)` → адаптивна сітка, компоненти.

- `Bulma` → чистий flexbox-фреймворк, простий у використанні.

- `Materialize` → реалізація Google Material Design.

- `UIkit` → легкий, зручний для швидкого прототипування.

Вибір залежить від потреб: Bootstrap — швидкий старт, Tailwind — кастомні
дизайн-системи, Bulma/Materialize — простота.

</details>

<details>
<summary>136. Як CSS-фреймворки на кшталт Bootstrap полегшують створення HTML-структур і UI?</summary>

#### HTML

- `Готові компоненти:` кнопки, форми, навігація, модальні вікна.

- `Адаптивна сітка (Grid)` → легке створення макетів для різних екранів.

- `Уніфіковані стилі` → не потрібно писати CSS з нуля.

- `JavaScript-компоненти` → каруселі, модальні, тултіпи без власного JS.

- `Кросбраузерність` → вирішує проблеми сумісності HTML/CSS.

Результат: швидша розробка, менше помилок у верстці, легке прототипування.

</details>

<details>
<summary>137. Які JavaScript-бібліотеки часто використовують для підвищення інтерактивності HTML-сторінок?</summary>

#### HTML

- `jQuery` → прості маніпуляції DOM і анімації (старі проєкти).

- `GSAP` → складні та плавні анімації.

- `Anime.js` → легкі анімації елементів.

- `Swiper.js` → інтерактивні каруселі і слайдери.

- `Chart.js / D3.js` → інтерактивні графіки та діаграми.

- `Sortable.js / Dragula` → drag-and-drop елементи.

- `Popper.js / Tippy.js` → тултіпи та спливаючі підказки.

Вибір залежить від задачі: анімації, інтерактивні UI, графіки або drag-and-drop.

</details>

<details>
<summary>138. Як HTML, CSS та JavaScript працюють разом у веб-розробці?</summary>

#### HTML

- HTML → структура сторінки, семантичні елементи.

- CSS → оформлення: кольори, шрифти, розташування, адаптивність.

- JavaScript → динаміка та інтерактивність (події, анімації, API).

#### Взаємозв'язок:

1. HTML надає «скелет».

2. CSS прикрашає цей скелет.

3. JS робить його живим, реагуючи на події користувача або сервер.

#### Приклад:

```html
<button id="btn">Клікни мене</button>
<style>
  #btn {
    background: blue;
    color: white;
    padding: 10px;
  }
</style>
<script>
  document
    .getElementById('btn')
    .addEventListener('click', () => alert('Привіт!'));
</script>
```

HTML + CSS + JS = базова тріада фронтенду, яка формує структуру, стиль і
поведінку сторінки.

</details>

<details>
<summary>139. Які переваги дає використання HTML-препроцесора (наприклад, Pug/Jade) у фронтенд-розробці?</summary>

#### HTML

- Скорочений синтаксис → менше коду, швидше писати.

- Шаблонізація → змінні, цикли, умови прямо в HTML.

- Міксини → повторне використання блоків розмітки.

- Краща структура → вкладеність зрозуміліша, ніж у звичайному HTML.

- Легко підтримувати динамічні сторінки в SSR (Express, NestJS).

Мінус: потрібна збірка, ще один шар абстракції.

</details>

<details>
<summary>140. Як працює механізм шаблонів у HTML і для чого він використовується?</summary>

#### HTML

- HTML має нативний тег `<template>` → його вміст не рендериться, доки не буде
  клонований через JS.

- Шаблон зберігає розмітку, стилі й навіть скрипти, але пасивно, поки не
  активований.

- Використовується для динамічного рендерингу контенту та у Web Components.

#### Приклад:

```html
<template id="user-template">
  <div class="user">
    <p class="name"></p>
  </div>
</template>

<script>
  const tmpl = document.getElementById('user-template');
  const clone = tmpl.content.cloneNode(true);
  clone.querySelector('.name').textContent = 'Alice';
  document.body.appendChild(clone);
</script>
```

Перевага — можна підготувати заготовки UI та багаторазово їх використовувати.

</details>

<details>
<summary>141. Які переваги дає мінімізація (minification) HTML-коду?</summary>

#### HTML

- Менший розмір файлу → швидше завантаження сторінки.

- Зменшення трафіку → особливо важливо для мобільних користувачів.

- Кращий SEO → швидкість сайту впливає на ранжування.

- Економія ресурсів сервера/CDN.

- Часто поєднується з мінімізацією CSS/JS і gzip/brotli компресією.

Мінус: складніше читати код → тому в проєктах зберігають оригінал + мініфіковану
збірку.

</details>

<details>
<summary>142. Які основні способи оптимізації часу завантаження HTML-сторінки?</summary>

#### HTML

- Мінімізувати HTML, CSS, JS (видалити пробіли, коментарі).

- Використовувати gzip/brotli стиснення на сервері.

- Кешування (HTTP headers, Service Worker).

- Critical CSS inline → решта асинхронно.

- Ледаче завантаження (loading="lazy") для зображень/iframe.

- Використання CDN для статичних ресурсів.

- Правильне підключення скриптів: defer або async.

- Оптимізація медіа (webp, responsive images).

- Зменшити кількість HTTP-запитів (об'єднання ресурсів).

Головна мета — швидкий First Contentful Paint (FCP) і хороший LCP для
користувачів і SEO.

</details>

<details>
<summary>143. Які переваги згортання пробілів (collapsing white space) в HTML та CSS?</summary>

#### HTML

1. **Зменшення розміру файлів:** Коли зайві пробіли, нові рядки або табуляції
   автоматично згортатимуться, це допомагає зменшити розмір файлів, що може бути
   корисно для оптимізації швидкості завантаження веб-сторінки. Це особливо
   важливо для мобільних пристроїв або при повільному інтернет-з'єднанні.

2. **Спрощення структури документа:** Згортання пробілів дозволяє уникнути
   зайвих пробілів між елементами, що робить код HTML та CSS більш чистим і
   зрозумілим. Код стає компактнішим, і його легше підтримувати та редагувати.

3. **Покращення читабельності контенту:** Згортання пробілів дозволяє браузеру
   правильно відображати текст, забезпечуючи, щоб зайві пробіли не порушували
   структуру та відображення елементів. Це особливо важливо при відображенні
   тексту в абзацах, списках або інших блочних елементах.

4. **Ізоляція та відокремлення елементів:** Коли працює згортання пробілів,
   можна забезпечити рівномірний розподіл простору між елементами, що дозволяє
   більш ефективно керувати відстанями між ними, без того щоб зайві пробіли
   впливали на вигляд веб-сторінки.

5. **Уникнення непотрібних порушень макета:** В деяких випадках зайві пробіли
   можуть спричиняти небажану поведінку макета, наприклад, додавання непотрібних
   відступів між елементами. Згортання пробілів допомагає уникнути таких
   ситуацій і зберегти дизайн відповідно до заданих правил стилів.

**Згортання пробілів** — це стандартна поведінка в HTML, що дозволяє браузеру
ігнорувати зайві пробіли, кілька переносів рядка або табуляцій між текстовими
елементами. Таким чином, візуальне відображення не залежить від кількості
пробілів у коді.

[MDN link](https://developer.mozilla.org/en-US/docs/Web/CSS/white-space-collapse)

</details>

<details>
<summary>144. Як у HTML реалізується підхід прогресивного вдосконалення (Progressive Enhancement)?</summary>

#### HTML

**Progressive Enhancement** → спочатку базова функціональність працює на
будь-якому браузері, а додаткові можливості додаються через сучасні HTML, CSS і
JS.

#### Принципи:

1. Базова розмітка — семантичний HTML для всіх користувачів.

2. Стілі CSS — покращують дизайн, але не ламають функціонал без них.

3. JavaScript — додає інтерактивність та анімації, але сайт працює і без нього.

#### Приклад:

```html
<form action="/submit" method="POST">
  <input type="text" name="email" required placeholder="Email" />
  <button type="submit">Відправити</button>
</form>
<script>
  // JS: покращення UX — валідація на клієнті
  document.querySelector('form').addEventListener('submit', e => {
    const email = e.target.email.value;
    if (!email.includes('@')) e.preventDefault();
  });
</script>
```

Базовий функціонал завжди доступний, а сучасні фічі підвищують зручність і
інтерктивність.

</details>

<details>
<summary>145. Які є поширені антипатерни (погані практики) при написанні HTML?</summary>

#### HTML

- Використання `<div>` і `<span>` замість семантичних тегів.

- Кілька `<h1>` на сторінці без потреби.

- Інлайнові стилі та події (`style=""`, `onclick=""`) → важче підтримувати.

- Відсутність атрибута `alt` у зображень.

- Дублікат `id` на сторінці.

- Використання застарілих тегів (`<font>`, `<center>`, `<marquee>`).

- Зловживання табличною розміткою для `layout` замість `CSS Grid/Flexbox`.

- Відсутність `lang` та `meta charset="UTF-8"`.

- Використання пустих елементів для відступів (наприклад, `<br><br>` замість
  `CSS`).

Такі практики шкодять SEO, доступності й ускладнюють підтримку коду.

</details>

<details>
<summary>146. Чому важлива документація при роботі з HTML і як її правильно вести?</summary>

#### HTML

- Підтримуваність коду → інші розробники швидко розуміють структуру та
  призначення елементів.

- Командна робота → зменшує помилки при масштабуванні проєкту.

- SEO і доступність → коментарі про призначення блоків, використання семантики.

- Стандарти та best practices → легше дотримуватись внутрішніх правил або
  HTML5-стандартів.

#### Практики:

- Використовувати коментарі <!-- пояснення -->.

- Документувати складні структури, шаблони та інтерактивні блоки.

- Ведення зовнішньої документації (Wiki, Storybook для UI-компонентів).

Добра документація економить час на підтримку, знижує помилки і покращує
командну роботу.

</details>

<details>
<summary>147. Що таке інструменти розробника браузера (DevTools) і як вони допомагають працювати з HTML?</summary>

#### HTML

- DevTools — вбудовані інструменти у браузерах (Chrome, Firefox, Edge) для
  налагодження вебсторінок.

- З HTML їх використовують для:

  - Перегляду та редагування DOM у реальному часі.

  - Аналізу атрибутів, структури й доступності елементів.

  - Відстеження завантаження ресурсів і продуктивності.

  - Перевірки SEO-тегів, метаінформації, семантики.

- Дає можливість швидко експериментувати з розміткою без зміни вихідного коду.

Краща практика: перевіряти валідність HTML, доступність і performance прямо
через DevTools.

</details>

<details>
<summary>148. Як забезпечити сумісність HTML-коду між різними браузерами?</summary>

#### HTML

- `Семантичний HTML` → базові елементи (`<header>`, `<main>`, `<form>`) працюють
  у всіх сучасних браузерах.

- `Поліфіли та шими` → підключення JS/CSS для старих або непідтримуваних функцій
  (e.g., fetch, Promise, `<dialog>`).

- `Тестування у кількох браузерах` → Chrome, Firefox, Edge, Safari, мобільні.

- `Can I Use` → перевірка підтримки тегів, атрибутів і API.

- `Progressive Enhancement / Graceful Degradation` → базовий функціонал
  доступний усюди, додаткові можливості — де підтримується.

- `DevTools і автоматичне тестування` → перевірка рендерингу, accessibility і
  JavaScript API.

Комбінація стандартного HTML, поліфілів, progressive enhancement і ретельного
тестування забезпечує максимальну сумісність.

</details>

<details>
<summary>149. Що таке візуалізація даних у HTML і як її реалізувати на вебсторінці?</summary>

#### HTML

Візуалізація даних — графічне відображення інформації (діаграми, графіки, карти)
прямо в браузері.

#### Реалізація в HTML:

1. Canvas API → малювання графіки через JavaScript.

2. SVG → векторна графіка, інтерактивна та масштабована.

3. Бібліотеки JS → полегшують роботу і додають інтерактивність:

   - Chart.js — швидке створення графіків.

   - D3.js — гнучкі й кастомні візуалізації.

   - Plotly.js — інтерактивні графіки з zoom і tooltip.

#### Приклад із Chart.js:

```html
<canvas id="myChart"></canvas>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
  const ctx = document.getElementById('myChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Red', 'Blue', 'Green'],
      datasets: [{ label: 'Votes', data: [12, 19, 7] }],
    },
  });
</script>
```

Візуалізації роблять дані більш зрозумілими і інтерактивними для користувача.

</details>

<details>
<summary>150. Які теги з найсвіжіших оновлень ви знаєте?</summary>

#### HTML

- `<mark>`: Для виділення тексту (позначення важливих фрагментів).
- `<progress>`: Для відображення прогресу виконання задачі.
- `<meter>`: Для вимірювання значення в певному діапазоні (наприклад, рівень
  батареї).

</details>

<details>
<summary>151. Які атрибути можна використовувати зі списками для зміни їхнього зовнішнього вигляду або поведінки?</summary>

#### HTML

Для списків в HTML основні атрибути та способи зміни вигляду/поведінки:

1. type (для `<ol>` та `<ul>` в старому HTML, частково застаріло):

- `<ol type="1">` — цифри (за замовчуванням)

- `<ol type="A">` — великі літери

- `<ol type="a">` — малі літери

- `<ol type="I">` — римські великі

- `<ol type="i">` — римські малі

2. start (для <ol>) — початковий номер:

```html
<ol start="5">
  <li>Пункт</li>
</ol>
```

3. reversed (для <ol>) — зворотний порядок нумерації.

4. compact (застарілий) — менш відстані між пунктами.

5. CSS (сучасний спосіб):

- `list-style-type` — тип маркера (disc, circle, square, none).

- `list-style-image` — використовувати зображення замість маркера.

- `list-style-position` — розташування маркера (inside, outside).

Сучасні проєкти майже завжди стилізують списки через CSS, а не HTML-атрибути.

</details>

<details>
<summary>152. Як створити посилання на різні розділи на одній веб-сторінці HTML?</summary>

#### HTML

Відповідь: Для створення гіперпосилання використовується тег `<a>`. Атрибут href
вказує URL або шлях.

Приклад:

```
<a href="https://example.com">Перейти на Example</a>
```

</details>

<details>
<summary>153. Опишіть основну структуру HTML-документа.</summary>

#### HTML

**Основна структура HTML-документа:**

```html
<!DOCTYPE html>
<!-- Оголошення типу документа -->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Назва сторінки</title>
  </head>
  <body>
    <!-- Вміст сторінки -->
  </body>
</html>
```

**Складові:**

1. `<!DOCTYPE html>` — вказує, що документ у HTML5.

2. `<html>` — кореневий елемент.

3. `<head>` — метадані (кодова сторінка, заголовок, стилі, скрипти).

4. `<body>` — видимий вміст сторінки.

</details>

<details>
<summary>154. Різниця між кнопкою та посиланням у HTML?</summary>

#### HTML

- `<button>` використовується для виконання дій (відправити форму, викликати
  JavaScript функції).

- `<a>` використовується для навігації (перехід на іншу сторінку, розділ).

#### Приклади:

```html
<button type="submit">Відправити</button> <a href="/about">Про нас</a>
```

#### Семантика:

- Кнопка — дія.

- Посилання — навігація.

Використання правильних елементів покращує доступність і SEO.

</details>

<details>
<summary>155. Чим відрізняється article від section?</summary>

#### HTML

- `<article>` — самостійний блок контенту, який може існувати окремо від
  сторінки і бути зрозумілий поза контекстом.

- `<section>` — логічний розділ сторінки.

#### Приклади використання:

**Article:**

- Новини, блоги, публікації.

- Коментарі користувачів.

- Форумні повідомлення.

**Section:**

- Розділи сторінки (Про нас, Контакти).

- Тематичні групи контенту.

#### Переваги:

- Покращує SEO і доступність.

- Легко стилізується та структуровано організовує контент.

</details>

<details>
<summary>156. Що таке категорії контенту в HTML5?</summary>

#### HTML

- **Семантика** — семантичні теги для структурування контенту (header, footer,
  article).
- **Мультимедіа** — підтримка аудіо та відео (audio, video).
- **Графіка** — елементи для роботи з графікою (canvas, SVG).
- **Сховище і офлайн** — API для локального зберігання даних (localStorage,
  IndexedDB).
- **Комунікації** — WebSocket, Server-Sent Events.
- **Форми** — розширені можливості форм (нові типи input, валідація).
- **Продуктивність** — API для оптимізації роботи (Web Workers).
- **Доступність** — ARIA-атрибути для покращення доступності.

</details>

<details>
<summary>157. Що таке data-атрибути, в яких випадках їх використовуєте?</summary>

#### HTML

Атрибут autocomplete в HTML використовується для вказівки браузеру, чи має він
автоматично заповнювати поля форми збереженими даними (наприклад, іменем,
адресою, електронною поштою). Він може бути включений або вимкнений для окремих
полів форми або для всієї форми.

#### Значення:

- `on` — дозволяє автозаповнення.
- `off` — вимикає автозаповнення.

</details>

<details>
<summary>158. Як створити форму в HTML і забезпечити її валідацію?</summary>

#### HTML

HTML-форма — це елемент, який збирає дані від користувача та відправляє їх на
сервер або обробляє на клієнті.

#### Приклад створення:

```html
<form action="/submit" method="post">
  <label for="name">Ім'я:</label>
  <input type="text" id="name" name="name" />

  <label for="email">Email:</label>
  <input type="email" id="email" name="email" />

  <button type="submit">Відправити</button>
</form>
```

- `<form>` — контейнер форми.
- `action` — URL, куди відправляються дані.
- `method` — спосіб відправки (get або post).

**Поля вводу** (`<input>`, `<textarea>`, `<select>`) + кнопки (`<button>` або
`<input type="submit">`).

</details>

<details>
<summary>159. Які методи відправки даних форми ви знаєте?</summary>

#### HTML

**`ApplicationCache`** в HTML5 — це механізм для офлайн-доступу до веб-додатків.
Він дозволяє зберігати ресурси веб-сторінки (HTML, CSS, JavaScript, зображення)
в кеші браузера, що дає змогу користувачам працювати з додатком без
інтернет-з'єднання.

Відповідно до специфікації HTML5, цей механізм був застарілий і замінений новими
API, такими як **Service Workers**.

</details>
