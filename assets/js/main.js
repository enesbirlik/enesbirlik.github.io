(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Theme toggle ---------- */
  var themeBtn = document.getElementById("theme-toggle");
  themeBtn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  /* ---------- Mobile menu ---------- */
  var nav = document.getElementById("nav");
  var menuBtn = document.getElementById("menu-toggle");
  menuBtn.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".nav-links a").forEach(function (a) {
    a.addEventListener("click", function () {
      nav.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    });
  });

  /* ---------- Active nav link ---------- */
  var links = {};
  document.querySelectorAll(".nav-links a").forEach(function (a) {
    links[a.getAttribute("href").slice(1)] = a;
  });
  if ("IntersectionObserver" in window) {
    var navObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = links[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          Object.keys(links).forEach(function (k) { links[k].classList.remove("active"); });
          link.classList.add("active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(links).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) navObs.observe(el);
    });

    /* ---------- Scroll reveal ---------- */
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { revealObs.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Roadmap progress (derived from the list) ---------- */
  var steps = document.querySelectorAll(".roadmap li");
  if (steps.length) {
    var done = document.querySelectorAll(".roadmap li.done").length;
    document.getElementById("roadmap-bar").style.width = Math.max(4, (done / steps.length) * 100) + "%";
    document.getElementById("roadmap-pct").textContent = done + "/" + steps.length;
  }

  /* ---------- Lightbox ---------- */
  var lastFocus = null;
  function openLightbox(src, caption) {
    lastFocus = document.activeElement;
    var box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", caption || "Image");
    box.innerHTML = '<button class="close" type="button" aria-label="Close">×</button><figure style="margin:0"><img alt=""><figcaption></figcaption></figure>';
    box.querySelector("img").src = src;
    box.querySelector("img").alt = caption || "";
    box.querySelector("figcaption").textContent = caption || "";
    function close() {
      box.remove();
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (lastFocus) lastFocus.focus();
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    box.addEventListener("click", function (e) {
      if (e.target === box || e.target.classList.contains("close")) close();
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(box);
    document.body.style.overflow = "hidden";
    box.querySelector(".close").focus();
  }
  document.querySelectorAll("[data-lightbox]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openLightbox(btn.getAttribute("data-lightbox"), btn.getAttribute("data-caption"));
    });
  });

  /* ---------- Terminal ---------- */
  var body = document.getElementById("term-body");
  var PS = '<span class="term-ps">visitor@enesbirlik:<span class="path">~</span>$</span>';

  function scrollToSection(id) {
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }

  var commands = {
    help: function () {
      return [
        '<span class="g">Available commands</span>',
        '  <span class="c">whoami</span>            who is this guy?',
        '  <span class="c">now</span>               what I\'m building right now',
        '  <span class="c">projects</span>          featured projects',
        '  <span class="c">experience</span>        work history',
        '  <span class="c">skills</span>            tech stack',
        '  <span class="c">awards</span>            competitions &amp; research',
        '  <span class="c">contact</span>           get in touch',
        '  <span class="c">resume</span>            open my CV (PDF)',
        '  <span class="c">ros2 topic list</span>   inspect the running system',
        '  <span class="c">theme</span>             toggle light/dark',
        '  <span class="c">clear</span>             clear the terminal',
        '<span class="d">…and maybe a few hidden ones.</span>'
      ].join("\n");
    },
    whoami: function () {
      return 'Enes Birlik: Robotics Software Engineer.\n' +
        'Mechatronics engineer building robots that work in the field:\n' +
        'localization, navigation, motion planning and the embedded systems\n' +
        'underneath them. Currently R&amp;D Software Engineer @ <span class="c">Kristal Endüstriyel</span>.';
    },
    now: function () {
      scrollToSection("now");
      return '<span class="a">[~]</span> SO-101 follower arm × ROS2 × embodied AI\n<span class="d">→ scrolling to /now</span>';
    },
    projects: function () {
      scrollToSection("projects");
      return [
        '<span class="g">01</span> Autonomous Mobile Robot Platform   <span class="d">ROS2 · Nav2 · SLAM</span>',
        '<span class="g">02</span> Modular 6-DOF Robotic Arm (ERC)    <span class="d">MoveIt2 · ros2_control</span>',
        '<span class="g">03</span> Hand-Tracking Arm Control          <span class="d">MuJoCo · CV</span>',
        '<span class="g">04</span> ROS2–MATLAB Cart-Pole Control      <span class="d">LQR · PID · Fuzzy</span>',
        '<span class="d">→ scrolling to /projects</span>'
      ].join("\n");
    },
    experience: function () {
      scrollToSection("experience");
      return [
        '<span class="g">●</span> R&amp;D Software Engineer   Kristal Endüstriyel   2026–',
        '<span class="c">○</span> SW Engineer Intern      STM                   2025',
        '<span class="c">○</span> Team Leader             KOU ROVER             2024–25',
        '<span class="c">○</span> SW Engineer Intern      MARS AMR              2024',
        '<span class="c">○</span> Software Team Lead      KOU ROVER             2023–24',
        '<span class="d">→ scrolling to /experience</span>'
      ].join("\n");
    },
    skills: function () {
      scrollToSection("skills");
      return 'lang:     C++, Python, C, C#, MATLAB\n' +
        'robotics: ROS2, Nav2, MoveIt2, ros2_control, micro-ROS\n' +
        'embedded: STM32, ESP32, Teensy, Raspberry Pi\n' +
        'sim:      Gazebo, MuJoCo, RViz, Blender\n' +
        '<span class="d">→ scrolling to /skills</span>';
    },
    awards: function () {
      scrollToSection("awards");
      return '🥇 TEKNOFEST 1st (2024, 2025) · 🥉 3rd (2022) · 6th (2023)\n' +
        '🌍 European Rover Challenge: international participant\n' +
        '🔬 2× TÜBİTAK 2209-A research projects\n' +
        '<span class="d">→ scrolling to /awards</span>';
    },
    contact: function () {
      return 'email:    <a href="mailto:enesbirlik0@gmail.com">enesbirlik0@gmail.com</a>\n' +
        'github:   <a href="https://github.com/enesbirlik" target="_blank" rel="noopener">github.com/enesbirlik</a>\n' +
        'linkedin: <a href="https://linkedin.com/in/enes-birlik" target="_blank" rel="noopener">linkedin.com/in/enes-birlik</a>';
    },
    resume: function () {
      window.open("assets/cv/Enes_Birlik_CV.pdf", "_blank", "noopener");
      return 'Opening <span class="c">Enes_Birlik_CV.pdf</span> …';
    },
    "ros2 topic list": function () {
      return '/cmd_vel\n/odom\n/scan\n/tf\n/zed2/point_cloud\n/move_group/goal\n/so101/joint_states   <span class="a">(coming soon)</span>\n/coffee_level        <span class="r">(critically low)</span>';
    },
    "ros2 node list": function () {
      return '/kristal_endustriyel   <span class="g">[active]</span>\n/stm_intern\n/kou_rover_team_lead\n/mars_amr_intern\n/kou_rover_software_lead\n/kou_rover_member';
    },
    "sudo make coffee": function () {
      return '<span class="r">[ERROR]</span> coffee_maker_node not found.\nCould not make coffee: hardware limitation.\nPlease visit the nearest coffee shop ☕';
    },
    sudo: function () {
      return 'visitor is not in the sudoers file. This incident will be reported. 🚨';
    },
    ls: function () {
      return '<span class="c">projects/</span>  <span class="c">experience/</span>  <span class="c">skills/</span>  <span class="c">awards/</span>  resume.pdf  README.md';
    },
    "cat readme.md": function () { return commands.whoami(); },
    neofetch: function () {
      return 'OS: Ubuntu + ROS 2 · Host: Robotics SW Engineer · Now: SO-101 + embodied AI';
    },
    theme: function () { themeBtn.click(); return "Theme switched."; },
    exit: function () { return "There is no escape. Try <span class=\"c\">contact</span> instead 🙂"; },
    pwd: function () { return "/home/visitor"; },
    date: function () { return new Date().toString(); },
    "rm -rf /": function () { return '<span class="r">Nice try.</span> Permission denied.'; }
  };
  var aliases = { cv: "resume", about: "whoami", "ls projects": "projects", "cat contact.txt": "contact", email: "contact" };
  var completions = Object.keys(commands).concat(Object.keys(aliases), ["clear"]);

  var history = [];
  var hIndex = -1;

  var inputLine = document.createElement("div");
  inputLine.className = "term-line";
  inputLine.innerHTML = PS + '<input class="term-input" type="text" aria-label="Terminal command input" autocomplete="off" autocapitalize="off" spellcheck="false">';
  body.appendChild(inputLine);
  var input = inputLine.querySelector("input");

  function print(cmdText, html) {
    var line = document.createElement("div");
    line.className = "term-line";
    line.innerHTML = PS;
    var c = document.createElement("span");
    c.textContent = cmdText;
    line.appendChild(c);
    body.insertBefore(line, inputLine);
    if (html != null && html !== "") {
      var out = document.createElement("pre");
      out.className = "term-out";
      out.innerHTML = html;
      body.insertBefore(out, inputLine);
    }
    body.scrollTop = body.scrollHeight;
  }

  function run(raw) {
    var cmd = raw.trim().replace(/\s+/g, " ");
    if (cmd) { history.push(cmd); }
    hIndex = -1;
    var key = cmd.toLowerCase();
    if (aliases[key]) key = aliases[key];
    if (key === "clear") {
      while (body.firstChild !== inputLine) body.removeChild(body.firstChild);
      return;
    }
    if (!cmd) { print("", null); return; }
    var fn = commands[key];
    var outHtml;
    if (fn) {
      outHtml = fn();
    } else {
      var safe = document.createElement("span");
      safe.textContent = cmd.split(" ")[0];
      outHtml = 'command not found: <span class="r">' + safe.innerHTML + '</span>. Type <span class="g">help</span> for available commands.';
    }
    print(cmd, outHtml);
  }

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      run(input.value);
      input.value = "";
    } else if (e.key === "ArrowUp") {
      if (history.length && hIndex < history.length - 1) {
        hIndex++;
        input.value = history[history.length - 1 - hIndex];
      }
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (hIndex > 0) {
        hIndex--;
        input.value = history[history.length - 1 - hIndex];
      } else {
        hIndex = -1;
        input.value = "";
      }
      e.preventDefault();
    } else if (e.key === "Tab") {
      var partial = input.value.toLowerCase();
      if (!partial) return; // let Tab move focus when empty
      e.preventDefault();
      var matches = completions.filter(function (c) { return c.indexOf(partial) === 0; });
      if (matches.length === 1) {
        input.value = matches[0];
      } else if (matches.length > 1) {
        print(input.value, matches.join("   "));
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      run("clear");
    }
  });

  // Clicking anywhere in the terminal focuses the prompt (without stealing text selection)
  body.addEventListener("mouseup", function () {
    if (!window.getSelection().toString()) input.focus({ preventScroll: true });
  });

  /* ---------- Footer year ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();
})();
