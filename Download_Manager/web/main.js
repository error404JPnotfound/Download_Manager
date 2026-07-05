window.onerror = function(message, source, lineno, colno, error) {
    const errText = message + " at " + source + ":" + lineno + ":" + colno + (error ? "\n" + error.stack : "");
    console.error(errText);
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.log_js_error(errText);
    }
};

const urlInputs = document.getElementById('url-inputs');
// Drag‑and‑Drop support for URLs / text files
urlInputs.addEventListener('dragover', e => {
    e.preventDefault();
    urlInputs.classList.add('dragover');
});
urlInputs.addEventListener('dragleave', e => {
    e.preventDefault();
    urlInputs.classList.remove('dragover');
});
urlInputs.addEventListener('drop', e => {
    e.preventDefault();
    urlInputs.classList.remove('dragover');
    const dt = e.dataTransfer;
    // Text data (e.g., dragged URL)
    const textData = dt.getData('text');
    if (textData) {
        urlInputs.value = urlInputs.value ? urlInputs.value + '\n' + textData : textData;
        return;
    }
    // Files (e.g., .txt containing URLs)
    if (dt.files && dt.files.length) {
        const file = dt.files[0];
        const reader = new FileReader();
        reader.onload = ev => {
            const content = ev.target.result;
            urlInputs.value = urlInputs.value ? urlInputs.value + '\n' + content : content;
        };
        reader.readAsText(file);
    }
});
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnPauseText = document.getElementById('btn-pause-text');
const btnStop = document.getElementById('btn-stop');
const btnClear = document.getElementById('btn-clear');
const btnProceed = document.getElementById('btn-proceed');
const btnBack = document.getElementById('btn-back');
const btnClearInput = document.getElementById('btn-clear-input');
const initialActions = document.getElementById('initial-actions');
const processActions = document.getElementById('process-actions');
const btnAddMore = document.getElementById('btn-add-more');
const addMoreContainer = document.getElementById('add-more-container');
let hasProceeded = false;

// Modal Elements
const confirmModal = document.getElementById('confirm-modal');
const chkDontShow = document.getElementById('chk-dont-show');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalConfirm = document.getElementById('btn-modal-confirm');
const btnOpenFolder = document.getElementById('btn-open-folder');
const btnClearConsole = document.getElementById('btn-clear-console');
const btnChangePath = document.getElementById('btn-change-path');
const lblDownloadPath = document.getElementById('lbl-download-path');
const queueList = document.getElementById('queue-list');
const queueEmptyState = document.getElementById('queue-empty-state');
const queueCountBadge = document.getElementById('queue-count');
const consoleBox = document.getElementById('console-box');
const engineStatusDot = document.getElementById('engine-status-dot');
const engineStatusText = document.getElementById('engine-status-text');
const navDownloads = document.getElementById('nav-downloads');
const navConsole = document.getElementById('nav-console');
const navHistory = document.getElementById('nav-history');
const contentGrid = document.querySelector('.content-grid');
const consoleSection = document.getElementById('console-section');
const historySection = document.getElementById('history-section');
const historyListBody = document.getElementById('history-list-body');
const btnClearHistory = document.getElementById('btn-clear-history');
const navCustomize = document.getElementById('nav-customize');
const customizeSection = document.getElementById('customize-section');
const btnResetTheme = document.getElementById('btn-reset-theme');
const navAbout = document.getElementById('nav-about');
const aboutSection = document.getElementById('about-section');
const navThanks = document.getElementById('nav-thanks');
const thanksSection = document.getElementById('thanks-section');
const pickPrimary = document.getElementById('pick-primary');
const pickSecondary = document.getElementById('pick-secondary');
const pickAccent = document.getElementById('pick-accent');
const pickBg = document.getElementById('pick-bg');
const hexPrimary = document.getElementById('hex-primary');
const hexSecondary = document.getElementById('hex-secondary');
const hexAccent = document.getElementById('hex-accent');
const hexBg = document.getElementById('hex-bg');

const btnSoundPlay = document.getElementById('btn-sound-play');
const sliderSoundVolume = document.getElementById('slider-sound-volume');
const lblSoundVolume = document.getElementById('lbl-sound-volume');
const chkSoundDisableStartup = document.getElementById('chk-sound-disable-startup');

const bgAudio = new Audio('sound.mp3');
bgAudio.loop = true;

const queuePanelSection = document.getElementById('queue-panel-section');
const reorderListContainer = document.getElementById('reorder-list-container');
const reorderList = document.getElementById('reorder-list');

// YouTube Quality modal variables
const ytQualityModal = document.getElementById('yt-quality-modal');
const btnYtModalCancel = document.getElementById('btn-yt-modal-cancel');
const btnYtModalConfirm = document.getElementById('btn-yt-modal-confirm');
const selectModalYtQuality = document.getElementById('modal-yt-quality');

// Local application state
let queueItems = [];

// Helper to escape HTML to prevent XSS
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

const selectLanguage = document.getElementById('select-language');

window.currentLanguage = 'en';
window.engineState = 'idle';
window.lastDownloadPath = '';

const translations = {
    en: {
        splash_status: "Initializing engine...",
        sidebar_subtitle: "Download Engine",
        nav_downloads: "Downloads",
        nav_history: "History",
        nav_log: "System Log",
        nav_customize: "Customize",
        nav_about: "About",
        engine_status_idle: "Engine: Idle",
        engine_status_downloading: "Engine: Downloading",
        engine_status_paused: "Engine: Paused",
        save_location: "Save Location:",
        choose_directory: "Choose Directory",
        add_urls: "Add URLs to Queue",
        queue_count_template: "{n} items",
        url_placeholder: "Paste your download URLs here...\ne.g., https://example.com/download-page-1\nhttps://example.com/download-page-2",
        btn_proceed: "Proceed",
        btn_clear: "Clear",
        btn_add_more: "Add More Links",
        drag_to_reorder: "Drag to reorder download sequence",
        btn_start_process: "Lift off",
        btn_pause_queue: "Pause Queue",
        btn_resume_queue: "Resume Queue",
        btn_stop_all: "Abort",
        btn_clear_queue: "Clear Queue",
        download_queue: "Download Queue",
        queue_empty_desc: "Queue is empty. Paste links and start downloading!",
        customize_theme: "Customize Theme Colors",
        btn_save_changes: "Save Changes",
        btn_reset_default: "Reset to Default",
        customize_theme_desc: "Adjust the primary colors of the application. Click \"Save Changes\" to persist them.",
        primary_color_label: "Primary Color (Buttons, Highlights)",
        secondary_color_label: "Secondary Color (Speed, Progress Bar)",
        accent_color_label: "Accent Color (Completed Badges)",
        bg_color_label: "Background Base Color",
        interface_language: "Interface Language",
        download_history: "Download History",
        downloads_folder: "Downloads Folder",
        clear_history: "Clear History",
        th_filename: "Filename",
        th_source_url: "Source URL",
        th_datetime: "Date/Time",
        th_status: "Status",
        about_title: "About Rocket DL",
        about_description: "Rocket DL is a premium, high-speed download manager designed for queue-based multi-threaded downloads and automated YouTube playlist extraction. Built with custom aesthetics and an intuitive user interface.",
        dev_linkedin: "Developer LinkedIn:",
        github_account: "GitHub Account:",
        github_profile: "GitHub Profile",
        console_title: "Engine Console Output",
        clear_console: "Clear Console",
        console_ready: "[System] Engine ready. Waiting for tasks...",
        yt_quality_title: "YouTube Quality Settings",
        yt_quality_desc: "We detected one or more YouTube links in your download queue. Please select your target quality option:",
        yt_opt_1: "Best Quality Combined (Up to 4K/60fps)",
        yt_opt_2: "1080p at 60fps (or best available)",
        yt_opt_3: "1080p at 30fps (saves space)",
        yt_opt_4: "720p at 60fps (or best available)",
        yt_opt_5: "720p at 30fps (saves space)",
        yt_opt_6: "Audio Only (MP3 format extraction)",
        modal_cancel: "Cancel",
        modal_confirm_start: "Confirm & Start",
        stop_modal_title: "Stop All Downloads?",
        stop_modal_desc: "Are you sure? You won't be able to resume the current downloads.",
        stop_modal_chk: "Don't show this warning again",
        modal_stop_yes: "Yes, Stop",
        disk_space_template: "{path} (Free Space: {free} of {total})",
        status_completed: "Completed",
        status_deleted: "Deleted",
        status_cancelled: "Cancelled",
        status_queued: "Queued",
        status_failed: "Failed",
        status_pending: "Pending...",
        status_analyzing: "Analyzing link...",
        status_ytdlp: "Downloading via yt-dlp...",
        status_downloading: "Downloading...",
        status_downloading_simple: "Downloading",
        status_page_loaded: "Page loaded, waiting for popup...",
        status_fetching: "Popup closed. Fetching file...",
        status_fail_btn: "Failed: Button not found",
        status_fail_timeout: "Failed: Timeout",
        status_error_prefix: "Error:",
        history_empty: "No download history available.",
        bg_music_title: "Background Music",
        btn_play: "Play",
        btn_pause: "Pause",
        lbl_volume: "Volume",
        chk_disable_startup: "Play music on startup",
        nav_thanks: "Special Thanks",
        connect_me_on: "connect me on:"
    },
    es: {
        splash_status: "Inicializando motor...",
        sidebar_subtitle: "Motor de Descargas",
        nav_downloads: "Descargas",
        nav_history: "Historial",
        nav_log: "Registro",
        nav_customize: "Personalizar",
        nav_about: "Acerca de",
        engine_status_idle: "Motor: Inactivo",
        engine_status_downloading: "Motor: Descargando",
        engine_status_paused: "Motor: Pausado",
        save_location: "Guardar en:",
        choose_directory: "Elegir carpeta",
        add_urls: "Añadir URLs a la cola",
        queue_count_template: "{n} elementos",
        url_placeholder: "Pegue sus enlaces de descarga aquí...\np. ej., https://example.com/pagina-1\nhttps://example.com/pagina-2",
        btn_proceed: "Proceder",
        btn_clear: "Limpiar",
        btn_add_more: "Añadir más enlaces",
        drag_to_reorder: "Arrastra para reordenar la secuencia de descarga",
        btn_start_process: "Iniciar descarga",
        btn_pause_queue: "Pausar cola",
        btn_resume_queue: "Reanudar cola",
        btn_stop_all: "Detener descargas",
        btn_clear_queue: "Limpiar cola",
        download_queue: "Cola de descargas",
        queue_empty_desc: "La cola está vacía. ¡Pegue enlaces y comience a descargar!",
        customize_theme: "Personalizar colores de tema",
        btn_save_changes: "Guardar cambios",
        btn_reset_default: "Restablecer por defecto",
        customize_theme_desc: "Ajuste los colores principales de la aplicación. Haga clic en \"Guardar cambios\" para guardarlos.",
        primary_color_label: "Color primario (Botones, Destacados)",
        secondary_color_label: "Color secundario (Velocidad, Barra de progreso)",
        accent_color_label: "Color de acento (Etiquetas completadas)",
        bg_color_label: "Color de fondo base",
        interface_language: "Idioma de la interfaz",
        download_history: "Historial de descargas",
        downloads_folder: "Carpeta de descargas",
        clear_history: "Limpiar historial",
        th_filename: "Nombre de archivo",
        th_source_url: "URL de origen",
        th_datetime: "Fecha/Hora",
        th_status: "Estado",
        about_title: "Acerca de Rocket DL",
        about_description: "Rocket DL es un gestor de descargas premium y de alta velocidad diseñado para descargas multi-hilo en cola y extracción automática de listas de reproducción de YouTube. Creado con una estética personalizada y una interfaz intuitiva.",
        dev_linkedin: "LinkedIn del desarrollador:",
        github_account: "Cuenta de GitHub:",
        github_profile: "Perfil de GitHub",
        console_title: "Consola del motor",
        clear_console: "Limpiar consola",
        console_ready: "[Sistema] Motor listo. Esperando tareas...",
        yt_quality_title: "Configuración de YouTube",
        yt_quality_desc: "Detectamos enlaces de YouTube en su cola. Seleccione la opción de calidad:",
        yt_opt_1: "Mejor calidad combinada (Hasta 4K/60fps)",
        yt_opt_2: "1080p a 60fps (or mejor disponible)",
        yt_opt_3: "1080p a 30fps (ahorra espacio)",
        yt_opt_4: "720p a 60fps (or mejor disponible)",
        yt_opt_5: "720p a 30fps (ahorra espacio)",
        yt_opt_6: "Solo audio (extracción en MP3)",
        modal_cancel: "Cancelar",
        modal_confirm_start: "Confirmar e iniciar",
        stop_modal_title: "¿Detener todas las descargas?",
        stop_modal_desc: "¿Está seguro? No podrá reanudar las descargas actuales.",
        stop_modal_chk: "No volver a mostrar esta advertencia",
        modal_stop_yes: "Sí, detener",
        disk_space_template: "{path} (Libre: {free} de {total})",
        status_completed: "Completado",
        status_deleted: "Eliminado",
        status_cancelled: "Cancelado",
        status_queued: "En cola",
        status_failed: "Fallido",
        status_pending: "Pendiente...",
        status_analyzing: "Analizando enlace...",
        status_ytdlp: "Descargando vía yt-dlp...",
        status_downloading: "Descargando...",
        status_downloading_simple: "Descargando",
        status_page_loaded: "Página cargada, esperando popup...",
        status_fetching: "Popup cerrado. Obteniendo archivo...",
        status_fail_btn: "Fallo: Botón no encontrado",
        status_fail_timeout: "Fallo: Tiempo de espera agotado",
        status_error_prefix: "Error:",
        history_empty: "No hay historial de descargas disponible.",
        bg_music_title: "Música de fondo",
        btn_play: "Reproducir",
        btn_pause: "Pausa",
        lbl_volume: "Volumen",
        chk_disable_startup: "Reproducir música al iniciar",
        nav_thanks: "Agradecimientos especiales",
        connect_me_on: "conéctame en:"
    },
    fr: {
        splash_status: "Initialisation du moteur...",
        sidebar_subtitle: "Moteur de Téléchargement",
        nav_downloads: "Téléchargements",
        nav_history: "Historique",
        nav_log: "Journal",
        nav_customize: "Personnaliser",
        nav_about: "À propos",
        engine_status_idle: "Moteur : Inactif",
        engine_status_downloading: "Moteur : Téléchargement",
        engine_status_paused: "Moteur : En pause",
        save_location: "Dossier d'enregistrement :",
        choose_directory: "Choisir dossier",
        add_urls: "Ajouter des URL à la file",
        queue_count_template: "{n} éléments",
        url_placeholder: "Collez vos liens de téléchargement ici...\nex., https://example.com/page-1\nhttps://example.com/page-2",
        btn_proceed: "Continuer",
        btn_clear: "Effacer",
        btn_add_more: "Ajouter des liens",
        drag_to_reorder: "Glissez pour réorganiser la séquence de téléchargement",
        btn_start_process: "Démarrer le processus",
        btn_pause_queue: "Mettre en pause",
        btn_resume_queue: "Reprendre la file",
        btn_stop_all: "Arrêter les téléchargements",
        btn_clear_queue: "Vider la file",
        download_queue: "File de téléchargement",
        queue_empty_desc: "La file est vide. Collez des liens et démarrez !",
        customize_theme: "Personnaliser les couleurs",
        btn_save_changes: "Enregistrer",
        btn_reset_default: "Par défaut",
        customize_theme_desc: "Ajustez les couleurs principales de l'application. Cliquez sur \"Enregistrer\" pour les sauvegarder.",
        primary_color_label: "Couleur principale (Boutons, Surlignage)",
        secondary_color_label: "Couleur secondaire (Vitesse, Barre de progression)",
        accent_color_label: "Couleur d'accentuation (Badges terminés)",
        bg_color_label: "Couleur de fond de base",
        interface_language: "Langue de l'interface",
        download_history: "Historique des téléchargements",
        downloads_folder: "Dossier de téléchargement",
        clear_history: "Effacer l'historique",
        th_filename: "Nom de fichier",
        th_source_url: "URL source",
        th_datetime: "Date/Heure",
        th_status: "Statut",
        about_title: "À propos d'Rocket DL",
        about_description: "Rocket DL is a premium, high-speed download manager designed for queue-based multi-threaded downloads and automated YouTube playlist extraction. Built with custom aesthetics and an intuitive user interface.",
        dev_linkedin: "LinkedIn du développeur :",
        github_account: "Compte GitHub :",
        github_profile: "Profil GitHub",
        console_title: "Console du moteur",
        clear_console: "Effacer la console",
        console_ready: "[Système] Moteur prêt. En attente...",
        yt_quality_title: "Qualité YouTube",
        yt_quality_desc: "Liens YouTube détectés. Sélectionnez l'option de qualité :",
        yt_opt_1: "Meilleure qualité (Jusqu'à 4K/60fps)",
        yt_opt_2: "1080p à 60fps (ou meilleure dispo)",
        yt_opt_3: "1080p à 30fps (économise l'espace)",
        yt_opt_4: "720p à 60fps (ou meilleure dispo)",
        yt_opt_5: "720p à 30fps (économise l'espace)",
        yt_opt_6: "Audio uniquement (MP3)",
        modal_cancel: "Annuler",
        modal_confirm_start: "Confirmer et lancer",
        stop_modal_title: "Arrêter tous les téléchargements ?",
        stop_modal_desc: "Êtes-vous sûr ? Vous ne pourrez pas reprendre les téléchargements en cours.",
        stop_modal_chk: "Ne plus afficher cet avertissement",
        modal_stop_yes: "Oui, arrêter",
        disk_space_template: "{path} (Libre : {free} sur {total})",
        status_completed: "Terminé",
        status_deleted: "Supprimé",
        status_cancelled: "Annulé",
        status_queued: "En file",
        status_failed: "Échoué",
        status_pending: "En attente...",
        status_analyzing: "Analyse du lien...",
        status_ytdlp: "Téléchargement via yt-dlp...",
        status_downloading: "Téléchargement...",
        status_downloading_simple: "Téléchargement",
        status_page_loaded: "Page chargée, attente popup...",
        status_fetching: "Popup fermée. Récupération du fichier...",
        status_fail_btn: "Échec : Bouton introuvable",
        status_fail_timeout: "Échec : Délai expiré",
        status_error_prefix: "Erreur :",
        history_empty: "Aucun historique de téléchargement disponible.",
        bg_music_title: "Musique de fond",
        btn_play: "Lire",
        btn_pause: "Pause",
        lbl_volume: "Volume",
        chk_disable_startup: "Jouer la musique au démarrage",
        nav_thanks: "Remerciements spéciaux",
        connect_me_on: "me contacter sur:"
    },
    de: {
        splash_status: "Engine wird initialisiert...",
        sidebar_subtitle: "Download-Engine",
        nav_downloads: "Downloads",
        nav_history: "Verlauf",
        nav_log: "Systemprotokoll",
        nav_customize: "Anpassen",
        nav_about: "Über uns",
        engine_status_idle: "Engine: Bereit",
        engine_status_downloading: "Engine: Herunterladen",
        engine_status_paused: "Engine: Pausiert",
        save_location: "Speicherort:",
        choose_directory: "Ordner wählen",
        add_urls: "URLs zur Warteschlange hinzufügen",
        queue_count_template: "{n} Einträge",
        url_placeholder: "Fügen Sie Ihre Download-Links hier ein...\nz. B. https://example.com/seite-1\nhttps://example.com/seite-2",
        btn_proceed: "Weiter",
        btn_clear: "Löschen",
        btn_add_more: "Mehr Links hinzufügen",
        drag_to_reorder: "Ziehen, um die Downloadreihenfolge zu ändern",
        btn_start_process: "Abheben",
        btn_pause_queue: "Warteschlange pausieren",
        btn_resume_queue: "Warteschlange fortsetzen",
        btn_stop_all: "Alle Downloads stoppen",
        btn_clear_queue: "Warteschlange löschen",
        download_queue: "Download-Warteschlange",
        queue_empty_desc: "Warteschlange ist leer. Links einfügen und Download starten!",
        customize_theme: "Theme-Farben anpassen",
        btn_save_changes: "Änderungen speichern",
        btn_reset_default: "Zurücksetzen",
        customize_theme_desc: "Passen Sie die Primärfarben an. Klicken Sie auf \"Änderungen speichern\", um sie zu übernehmen.",
        primary_color_label: "Primärfarbe (Buttons, Highlights)",
        secondary_color_label: "Sekundärfarbe (Geschwindigkeit, Fortschrittsbalken)",
        accent_color_label: "Akzentfarbe (Erledigte Badges)",
        bg_color_label: "Hintergrund-Basisfarbe",
        interface_language: "Oberflächen-Sprache",
        download_history: "Download-Verlauf",
        downloads_folder: "Downloads-Ordner",
        clear_history: "Verlauf löschen",
        th_filename: "Dateiname",
        th_source_url: "Quell-URL",
        th_datetime: "Datum/Uhrzeit",
        th_status: "Status",
        about_title: "Über Rocket DL",
        about_description: "Rocket DL is a premium, high-speed download manager designed for queue-based multi-threaded downloads and automated YouTube playlist extraction.",
        dev_linkedin: "Entwickler LinkedIn:",
        github_account: "GitHub-Konto:",
        github_profile: "GitHub-Profil",
        console_title: "Engine-Konsolenausgabe",
        clear_console: "Konsole löschen",
        console_ready: "[System] Engine bereit. Warte auf Aufgaben...",
        yt_quality_title: "YouTube-Qualitätseinstellungen",
        yt_quality_desc: "YouTube-Links in der Warteschlange erkannt. Bitte Qualitätsoption wählen:",
        yt_opt_1: "Beste Qualität kombiniert (Bis zu 4K/60fps)",
        yt_opt_2: "1080p bei 60fps (oder am besten verfügbar)",
        yt_opt_3: "1080p bei 30fps (platzsparend)",
        yt_opt_4: "720p bei 60fps (oder am besten verfügbar)",
        yt_opt_5: "720p bei 30fps (platzsparend)",
        yt_opt_6: "Nur Audio (MP3-Format)",
        modal_cancel: "Abbrechen",
        modal_confirm_start: "Bestätigen & Starten",
        stop_modal_title: "Alle Downloads stoppen?",
        stop_modal_desc: "Sind Sie sicher? Laufende Downloads können nicht fortgesetzt werden.",
        stop_modal_chk: "Diese Warnung nicht mehr anzeigen",
        modal_stop_yes: "Ja, Stoppen",
        disk_space_template: "{path} (Frei: {free} von {total})",
        status_completed: "Abgeschlossen",
        status_deleted: "Gelöscht",
        status_cancelled: "Abgebrochen",
        status_queued: "Warteschlange",
        status_failed: "Fehlgeschlagen",
        status_pending: "Ausstehend...",
        status_analyzing: "Link wird analysiert...",
        status_ytdlp: "Herunterladen über yt-dlp...",
        status_downloading: "Herunterladen...",
        status_downloading_simple: "Herunterladen",
        status_page_loaded: "Seite geladen, warte auf Popup...",
        status_fetching: "Popup geschlossen. Datei wird abgerufen...",
        status_fail_btn: "Fehlgeschlagen: Button nicht gefunden",
        status_fail_timeout: "Fehlgeschlagen: Zeitüberschreitung",
        status_error_prefix: "Fehler:",
        history_empty: "Kein Download-Verlauf verfügbar.",
        bg_music_title: "Hintergrundmusik",
        btn_play: "Abspielen",
        btn_pause: "Pause",
        lbl_volume: "Lautstärke",
        chk_disable_startup: "Musik beim Starten abspielen",
        nav_thanks: "Besonderer Dank",
        connect_me_on: "verbinde dich mit mir auf:"
    },
    pt: {
        splash_status: "Inicializando motor...",
        sidebar_subtitle: "Motor de Download",
        nav_downloads: "Downloads",
        nav_history: "Histórico",
        nav_log: "Log do Sistema",
        nav_customize: "Personalizar",
        nav_about: "Sobre",
        engine_status_idle: "Motor: Ocioso",
        engine_status_downloading: "Motor: Baixando",
        engine_status_paused: "Motor: Pausado",
        save_location: "Local para Salvar:",
        choose_directory: "Escolher Diretório",
        add_urls: "Adicionar URLs à Fila",
        queue_count_template: "{n} itens",
        url_placeholder: "Cole seus links de download aqui...\nex., https://example.com/pagina-1\nhttps://example.com/pagina-2",
        btn_proceed: "Prosseguir",
        btn_clear: "Limpar",
        btn_add_more: "Adicionar Mais Links",
        drag_to_reorder: "Arraste para reordenar a sequência de downloads",
        btn_start_process: "Iniciar Processo",
        btn_pause_queue: "Pausar Fila",
        btn_resume_queue: "Retomar Fila",
        btn_stop_all: "Parar Todos Downloads",
        btn_clear_queue: "Limpar Fila",
        download_queue: "Fila de Downloads",
        queue_empty_desc: "A fila está vazia. Cole os links e comece a baixar!",
        customize_theme: "Personalizar Cores do Tema",
        btn_save_changes: "Salvar Alterações",
        btn_reset_default: "Restaurar Padrão",
        customize_theme_desc: "Ajuste as cores principais do aplicativo. Clique em \"Salvar Alterações\" para confirmar.",
        primary_color_label: "Cor Primária (Botões, Destaques)",
        secondary_color_label: "Cor Secundária (Velocidade, Barra de Progresso)",
        accent_color_label: "Cor de Destaque (Etiquetas Concluídas)",
        bg_color_label: "Cor de Fundo Base",
        interface_language: "Idioma da Interface",
        download_history: "Histórico de Downloads",
        downloads_folder: "Pasta de Downloads",
        clear_history: "Limpar Histórico",
        th_filename: "Nome do Arquivo",
        th_source_url: "URL de Origem",
        th_datetime: "Data/Hora",
        th_status: "Status",
        about_title: "Sobre o Rocket DL",
        about_description: "O Rocket DL é um gerenciador de downloads de alta velocidade e premium, projetado para downloads multi-thread em fila e extração automática de playlists do YouTube.",
        dev_linkedin: "LinkedIn do Desenvolvedor:",
        github_account: "Conta do GitHub:",
        github_profile: "Perfil do GitHub",
        console_title: "Console de Saída do Motor",
        clear_console: "Limpar Console",
        console_ready: "[Sistema] Motor pronto. Aguardando tarefas...",
        yt_quality_title: "Qualidade do YouTube",
        yt_quality_desc: "Detectamos links do YouTube na fila. Selecione a opção de qualidade:",
        yt_opt_1: "Melhor Qualidade Combinada (Até 4K/60fps)",
        yt_opt_2: "1080p a 60fps (ou melhor disponível)",
        yt_opt_3: "1080p a 30fps (economiza espaço)",
        yt_opt_4: "720p a 60fps (ou melhor disponível)",
        yt_opt_5: "720p a 30fps (economiza espaço)",
        yt_opt_6: "Apenas Áudio (Formato MP3)",
        modal_cancel: "Cancelar",
        modal_confirm_start: "Confirmar & Iniciar",
        stop_modal_title: "Parar Todos Downloads?",
        stop_modal_desc: "Tem certeza? Não será possível retomar os downloads atuais.",
        stop_modal_chk: "Não exibir este aviso novamente",
        modal_stop_yes: "Sim, Parar",
        disk_space_template: "{path} (Livre: {free} de {total})",
        status_completed: "Concluído",
        status_deleted: "Excluído",
        status_cancelled: "Cancelado",
        status_queued: "Na fila",
        status_failed: "Falhou",
        status_pending: "Pendente...",
        status_analyzing: "Analisando link...",
        status_ytdlp: "Baixando via yt-dlp...",
        status_downloading: "Baixando...",
        status_downloading_simple: "Baixando",
        status_page_loaded: "Página carregada, aguardando popup...",
        status_fetching: "Popup fechado. Buscando arquivo...",
        status_fail_btn: "Falhou: Botão não encontrado",
        status_fail_timeout: "Falhou: Tempo limite atingido",
        status_error_prefix: "Erro:",
        history_empty: "Nenhum histórico de downloads disponível.",
        bg_music_title: "Música de fundo",
        btn_play: "Reproduzir",
        btn_pause: "Pausar",
        lbl_volume: "Volume",
        chk_disable_startup: "Tocar música ao iniciar",
        nav_thanks: "Agradecimentos especiais",
        connect_me_on: "conecte-se comigo em:"
    },
    ru: {
        splash_status: "Инициализация движка...",
        sidebar_subtitle: "Загрузчик",
        nav_downloads: "Загрузки",
        nav_history: "История",
        nav_log: "Системный лог",
        nav_customize: "Настройка",
        nav_about: "О программе",
        engine_status_idle: "Движок: Ожидание",
        engine_status_downloading: "Движок: Скачивание",
        engine_status_paused: "Движок: Приостановлен",
        save_location: "Сохранить в:",
        choose_directory: "Выбрать папку",
        add_urls: "Добавить ссылки в очередь",
        queue_count_template: "Элементов: {n}",
        url_placeholder: "Вставьте ссылки для скачивания сюда...\nпример: https://example.com/file1\nhttps://example.com/file2",
        btn_proceed: "Продолжить",
        btn_clear: "Очистить",
        btn_add_more: "Добавить еще",
        drag_to_reorder: "Перетащите для изменения порядка",
        btn_start_process: "Начать процесс",
        btn_pause_queue: "Пауза очереди",
        btn_resume_queue: "Продолжить очередь",
        btn_stop_all: "Остановить всё",
        btn_clear_queue: "Очистить очередь",
        download_queue: "Очередь загрузок",
        queue_empty_desc: "Очередь пуста. Вставьте ссылки и начните скачивание!",
        customize_theme: "Настройка цветов темы",
        btn_save_changes: "Сохранить",
        btn_reset_default: "Сбросить",
        customize_theme_desc: "Настройте основные цвета приложения. Нажмите \"Сохранить\", чтобы применить их.",
        primary_color_label: "Основной цвет (Кнопки, Выделение)",
        secondary_color_label: "Вспомогательный цвет (Скорость, Прогресс)",
        accent_color_label: "Цвет акцента (Завершенные)",
        bg_color_label: "Базовый цвет фона",
        interface_language: "Язык интерфейса",
        download_history: "История загрузок",
        downloads_folder: "Папка загрузок",
        clear_history: "Очистить историю",
        th_filename: "Имя файла",
        th_source_url: "Ссылка-источник",
        th_datetime: "Дата/Время",
        th_status: "Статус",
        about_title: "Об Rocket DL",
        about_description: "Rocket DL — это профессиональный менеджер загрузок с поддержкой многопоточности и автоматического скачивания плейлистов YouTube.",
        dev_linkedin: "Разработчик LinkedIn:",
        github_account: "Профиль GitHub:",
        github_profile: "Профиль GitHub",
        console_title: "Консольный вывод",
        clear_console: "Очистить консоль",
        console_ready: "[Система] Движок готов. Ожидание задач...",
        yt_quality_title: "Качество YouTube",
        yt_quality_desc: "Обнаружены ссылки YouTube. Выберите желаемое качество:",
        yt_opt_1: "Максимальное (До 4K/60fps)",
        yt_opt_2: "1080p 60fps (или лучшее доступное)",
        yt_opt_3: "1080p 30fps (экономия места)",
        yt_opt_4: "720p 60fps (или лучшее доступное)",
        yt_opt_5: "720p 30fps (экономия места)",
        yt_opt_6: "Только аудио (в формате MP3)",
        modal_cancel: "Отмена",
        modal_confirm_start: "Подтвердить и начать",
        stop_modal_title: "Остановить все загрузки?",
        stop_modal_desc: "Вы уверены? Вы не сможете возобновить текущие загрузки.",
        stop_modal_chk: "Больше не показывать это предупреждение",
        modal_stop_yes: "Да, остановить",
        disk_space_template: "{path} (Свободно: {free} из {total})",
        status_completed: "Завершено",
        status_deleted: "Удалено",
        status_cancelled: "Отменено",
        status_queued: "В очереди",
        status_failed: "Ошибка",
        status_pending: "Ожидание...",
        status_analyzing: "Анализ ссылки...",
        status_ytdlp: "Скачивание через yt-dlp...",
        status_downloading: "Скачивание...",
        status_downloading_simple: "Скачивание",
        status_page_loaded: "Страница загружена, ожидание всплывающего окна...",
        status_fetching: "Всплывающее окно закрыто. Получение файла...",
        status_fail_btn: "Ошибка: Кнопка не найдена",
        status_fail_timeout: "Ошибка: Время ожидания истекло",
        status_error_prefix: "Ошибка:",
        history_empty: "История загрузок пуста.",
        bg_music_title: "Фоновая музыка",
        btn_play: "Играть",
        btn_pause: "Пауза",
        lbl_volume: "Громкость",
        chk_disable_startup: "Воспроизводить музыку при запуске",
        nav_thanks: "Благодарности",
        connect_me_on: "связаться со мной:"
    },
    zh: {
        splash_status: "正在初始化引擎...",
        sidebar_subtitle: "下载引擎",
        nav_downloads: "下载列表",
        nav_history: "历史记录",
        nav_log: "系统日志",
        nav_customize: "个性化",
        nav_about: "关于我们",
        engine_status_idle: "引擎状态: 空闲",
        engine_status_downloading: "引擎状态: 下载中",
        engine_status_paused: "引擎状态: 已暂停",
        save_location: "保存位置:",
        choose_directory: "选择目录",
        add_urls: "添加 URL 到队列",
        queue_count_template: "{n} 个项目",
        url_placeholder: "在此处粘贴您的下载链接...\n例如: https://example.com/file1\nhttps://example.com/file2",
        btn_proceed: "继续操作",
        btn_clear: "清空输入",
        btn_add_more: "添加更多链接",
        drag_to_reorder: "拖拽以重新排序下载顺序",
        btn_start_process: "起飞",
        btn_pause_queue: "暂停队列",
        btn_resume_queue: "恢复下载",
        btn_stop_all: "停止所有下载",
        btn_clear_queue: "清空队列",
        download_queue: "下载队列",
        queue_empty_desc: "队列为空。请粘贴链接开始下载！",
        customize_theme: "自定义主题颜色",
        btn_save_changes: "保存修改",
        btn_reset_default: "恢复默认",
        customize_theme_desc: "调整应用的主题颜色。点击\"保存修改\"以持久化它们。",
        primary_color_label: "主色调（按钮、高亮）",
        secondary_color_label: "辅色调（速度、进度条）",
        accent_color_label: "强调色（已完成标签）",
        bg_color_label: "背景基础色",
        interface_language: "界面语言",
        download_history: "下载历史",
        downloads_folder: "打开下载文件夹",
        clear_history: "清除历史",
        th_filename: "文件名",
        th_source_url: "来源 URL",
        th_datetime: "日期/时间",
        th_status: "状态",
        about_title: "关于 Rocket DL",
        about_description: "Rocket DL 是一款高端、高速的下载管理器，专门为队列式多线程下载和自动提取 YouTube 播放列表而设计。",
        dev_linkedin: "开发者 LinkedIn:",
        github_account: "GitHub 账号:",
        github_profile: "GitHub Profile",
        console_title: "引擎控制台输出",
        clear_console: "清除控制台",
        console_ready: "[系统] 引擎已就绪。正在等待任务...",
        yt_quality_title: "YouTube 质量设置",
        yt_quality_desc: "在队列中检测到 YouTube 链接。请选择目标质量选项：",
        yt_opt_1: "最佳质量合并 (最高支持 4K/60fps)",
        yt_opt_2: "1080p 60fps (或最佳可用)",
        yt_opt_3: "1080p 30fps (节省空间)",
        yt_opt_4: "720p 60fps (或最佳可用)",
        yt_opt_5: "720p 30fps (节省空间)",
        yt_opt_6: "仅提取音频 (MP3 格式)",
        modal_cancel: "取消",
        modal_confirm_start: "确认并开始",
        stop_modal_title: "停止所有下载？",
        stop_modal_desc: "您确定要停止吗？您将无法恢复当前的下载任务。",
        stop_modal_chk: "不再显示此警告",
        modal_stop_yes: "是的，停止",
        disk_space_template: "{path} (可用空间: {total} 中的 {free})",
        status_completed: "已完成",
        status_deleted: "已删除",
        status_cancelled: "已取消",
        status_queued: "排队中",
        status_failed: "失败",
        status_pending: "挂起...",
        status_analyzing: "正在分析链接...",
        status_ytdlp: "正在通过 yt-dlp 下载...",
        status_downloading: "正在下载...",
        status_downloading_simple: "正在下载",
        status_page_loaded: "页面已加载，正在等待弹窗...",
        status_fetching: "弹窗已关闭。正在获取文件...",
        status_fail_btn: "失败：未找到下载按钮",
        status_fail_timeout: "失败：超时",
        status_error_prefix: "错误:",
        history_empty: "暂无下载历史记录。",
        bg_music_title: "背景音乐",
        btn_play: "播放",
        btn_pause: "暂停",
        lbl_volume: "音量",
        chk_disable_startup: "启动时播放音乐",
        nav_thanks: "特别鸣谢",
        connect_me_on: "联系我:"
    },
    ja: {
        splash_status: "エンジンを初期化中...",
        sidebar_subtitle: "ダウンロードエンジン",
        nav_downloads: "ダウンロード",
        nav_history: "履歴",
        nav_log: "システムログ",
        nav_customize: "カスタマイズ",
        nav_about: "情報",
        engine_status_idle: "状態: アイドル",
        engine_status_downloading: "状態: ダウンロード中",
        engine_status_paused: "状態: 一時停止中",
        save_location: "保存先:",
        choose_directory: "フォルダを選択",
        add_urls: "URL をキューに追加",
        queue_count_template: "{n} 個のアイテム",
        url_placeholder: "ここにダウンロードリンクを貼り付けます...\n例: https://example.com/file1\nhttps://example.com/file2",
        btn_proceed: "進む",
        btn_clear: "クリア",
        btn_add_more: "リンクを追加",
        drag_to_reorder: "ドラッグして順序を入れ替えます",
        btn_start_process: "ダウンロード開始",
        btn_pause_queue: "一時停止",
        btn_resume_queue: "再開",
        btn_stop_all: "中止",
        btn_clear_queue: "キューをクリア",
        download_queue: "ダウンロードキュー",
        queue_empty_desc: "キューが空です。リンクを貼り付けて開始してください！",
        customize_theme: "テーマカラーのカスタマイズ",
        btn_save_changes: "変更を保存",
        btn_reset_default: "デフォルトに戻す",
        customize_theme_desc: "アプリのテーマカラーを調整します。「変更を保存」をクリックして適用します。",
        primary_color_label: "プライマリカラー（ボタン、ハイライト）",
        secondary_color_label: "セカンダリカラー（速度、プログレスバー）",
        accent_color_label: "アクセントカラー（完了バッジ）",
        bg_color_label: "ベース背景色",
        interface_language: "表示言語",
        download_history: "ダウンロード履歴",
        downloads_folder: "保存フォルダを開く",
        clear_history: "履歴をクリア",
        th_filename: "ファイル名",
        th_source_url: "転送元 URL",
        th_datetime: "日時",
        th_status: "ステータス",
        about_title: "Rocket DL について",
        about_description: "Rocket DL は、キューベースのマルチスレッドダウンロードと YouTube プレイリスト自動抽出のために設計された高速ダウンロードマネージャーです。",
        dev_linkedin: "開発者 LinkedIn:",
        github_account: "GitHub アカウント:",
        github_profile: "GitHub プロファイル",
        console_title: "エンジンコンソール出力",
        clear_console: "コンソールをクリア",
        console_ready: "[システム] エンジン準備完了。タスクを待機中...",
        yt_quality_title: "YouTube 画質設定",
        yt_quality_desc: "キュー内に YouTube リンクが検出されました。画質を選択してください：",
        yt_opt_1: "最高の組み合わせ画質 (最大 4K/60fps)",
        yt_opt_2: "1080p 60fps (or 利用可能な最高値)",
        yt_opt_3: "1080p 30fps (容量を節約)",
        yt_opt_4: "720p 60fps (or 利用可能な最高値)",
        yt_opt_5: "720p 30fps (容量を節約)",
        yt_opt_6: "オーディオのみ (MP3 形式)",
        modal_cancel: "キャンセル",
        modal_confirm_start: "確定して開始",
        stop_modal_title: "すべてのダウンロードを停止しますか？",
        stop_modal_desc: "よろしいですか？現在のダウンロードを再開することはできません。",
        stop_modal_chk: "次回からこの警告を表示しない",
        modal_stop_yes: "はい、停止する",
        disk_space_template: "{path} (空き容量: {total} 中 {free})",
        status_completed: "完了",
        status_deleted: "削除済み",
        status_cancelled: "キャンセル",
        status_queued: "待機中",
        status_failed: "失敗",
        status_pending: "保留中...",
        status_analyzing: "リンクを分析中...",
        status_ytdlp: "yt-dlp でダウンロード中...",
        status_downloading: "ダウンロード中...",
        status_downloading_simple: "ダウンロード中",
        status_page_loaded: "ページ読み込み完了、ポップアップ待機中...",
        status_fetching: "ポップアップが閉じました。ファイルを取得中...",
        status_fail_btn: "失敗: ボタンが見つかりません",
        status_fail_timeout: "失敗: タイムアウト",
        status_error_prefix: "エラー:",
        history_empty: "ダウンロード履歴はありません。",
        bg_music_title: "BGM",
        btn_play: "再生",
        btn_pause: "一時停止",
        lbl_volume: "音量",
        chk_disable_startup: "起動時に音楽を再生",
        nav_thanks: "特別感謝",
        connect_me_on: "連絡先:"
    },
    ko: {
        splash_status: "엔진 초기화 중...",
        sidebar_subtitle: "다운로드 엔진",
        nav_downloads: "다운로드",
        nav_history: "기록",
        nav_log: "시스템 로그",
        nav_customize: "사용자 설정",
        nav_about: "정보",
        engine_status_idle: "엔진 상태: 대기 중",
        engine_status_downloading: "엔진 상태: 다운로드 중",
        engine_status_paused: "엔진 상태: 일시 중지됨",
        save_location: "저장 위치:",
        choose_directory: "폴더 선택",
        add_urls: "큐에 URL 추가",
        queue_count_template: "{n}개 항목",
        url_placeholder: "여기에 다운로드 링크를 붙여넣으세요...\n예: https://example.com/file1\nhttps://example.com/file2",
        btn_proceed: "계속",
        btn_clear: "지우기",
        btn_add_more: "링크 추가",
        drag_to_reorder: "드래그하여 다운로드 순서 변경",
        btn_start_process: "다운로드 시작",
        btn_pause_queue: "일시 중지",
        btn_resume_queue: "다운로드 재개",
        btn_stop_all: "중단",
        btn_clear_queue: "대기열 비우기",
        download_queue: "다운로드 대기열",
        queue_empty_desc: "대기열이 비어 있습니다. 링크를 붙여넣고 시작하세요!",
        customize_theme: "테마 색상 변경",
        btn_save_changes: "변경사항 저장",
        btn_reset_default: "기본값으로 초기화",
        customize_theme_desc: "앱의 기본 색상을 조정합니다. 「변경사항 저장」을 눌러 저장하십시오.",
        primary_color_label: "기본 색상 (버튼, 하이라이트)",
        secondary_color_label: "보조 색상 (속도, 진행 바)",
        accent_color_label: "강조 색상 (완료 배지)",
        bg_color_label: "기본 배경 색상",
        interface_language: "인터페이스 언어",
        download_history: "다운로드 기록",
        downloads_folder: "저장 폴더열기",
        clear_history: "기록 지우기",
        th_filename: "파일명",
        th_source_url: "소스 URL",
        th_datetime: "날짜/시간",
        th_status: "상태",
        about_title: "Rocket DL 정보",
        about_description: "Rocket DL는 다중 스레드 큐 방식 다운로드와 YouTube 재생목록 자동 추출을 위해 개발된 고성능 다운로드 관리자입니다.",
        dev_linkedin: "개발자 LinkedIn:",
        github_account: "GitHub 계정:",
        github_profile: "GitHub 프로필",
        console_title: "엔진 콘솔 출력",
        clear_console: "콘솔 비우기",
        console_ready: "[시스템] 엔진 준비 완료. 작업을 대기 중...",
        yt_quality_title: "YouTube 화질 설정",
        yt_quality_desc: "대기열에서 YouTube 링크를 감지했습니다. 화질 옵션을 선택하세요:",
        yt_opt_1: "최고의 결합 화질 (최대 4K/60fps)",
        yt_opt_2: "1080p 60fps (또는 사용 가능한 최고 화질)",
        yt_opt_3: "1080p 30fps (용량 절약)",
        yt_opt_4: "720p 60fps (또는 사용 가능한 최고 화질)",
        yt_opt_5: "720p 30fps (용량 절약)",
        yt_opt_6: "오디오 전용 (MP3 형식)",
        modal_cancel: "취소",
        modal_confirm_start: "확인 및 시작",
        stop_modal_title: "모든 다운로드를 중지할까요?",
        stop_modal_desc: "진짜 중지하시겠습니까? 현재 진행 중인 다운로드는 재개할 수 없습니다.",
        stop_modal_chk: "다시 경고창을 표시하지 않음",
        modal_stop_yes: "예, 중지합니다",
        disk_space_template: "{path} (여유 공간: {total} 중 {free})",
        status_completed: "완료",
        status_deleted: "삭제됨",
        status_cancelled: "취소됨",
        status_queued: "대기 중",
        status_failed: "실패",
        status_pending: "대기 중...",
        status_analyzing: "링크 분석 중...",
        status_ytdlp: "yt-dlp로 다운로드 중...",
        status_downloading: "다운로드 중...",
        status_downloading_simple: "다운로드 중",
        status_page_loaded: "페이지 로드됨, 팝업 대기 중...",
        status_fetching: "팝업 닫힘. 파일 가져오는 중...",
        status_fail_btn: "실패: 버튼을 찾을 수 없음",
        status_fail_timeout: "실패: 시간 초과",
        status_error_prefix: "오류:",
        history_empty: "다운로드 내역이 없습니다.",
        bg_music_title: "배경 음악",
        btn_play: "재생",
        btn_pause: "일시 중지",
        lbl_volume: "볼륨",
        chk_disable_startup: "시작 시 음악 재생",
        nav_thanks: "특별 감사",
        connect_me_on: "연락처:"
    },
    hi: {
        splash_status: "इंजन प्रारंभ हो रहा है...",
        sidebar_subtitle: "डाउनलोड इंजन",
        nav_downloads: "डाउनलोड",
        nav_history: "इतिहास",
        nav_log: "सिस्टम लॉग",
        nav_customize: "अनुकूलित करें",
        nav_about: "के बारे में",
        engine_status_idle: "इंजन: निष्क्रिय",
        engine_status_downloading: "इंजन: डाउनलोड हो रहा है",
        engine_status_paused: "इंजन: रुका हुआ",
        save_location: "सहेजने का स्थान:",
        choose_directory: "फ़ोल्डर चुनें",
        add_urls: "कतार में URL जोड़ें",
        queue_count_template: "{n} आइटम",
        url_placeholder: "अपने डाउनलोड लिंक यहाँ पेस्ट करें...\nजैसे: https://example.com/file1\nhttps://example.com/file2",
        btn_proceed: "आगे बढ़ें",
        btn_clear: "साफ करें",
        btn_add_more: "अधिक लिंक जोड़ें",
        drag_to_reorder: "डाउनलोड क्रम बदलने के लिए खींचें",
        btn_start_process: "लिफ्ट ऑफ",
        btn_pause_queue: "कतार रोकें",
        btn_resume_queue: "कतार पुनः चालू करें",
        btn_stop_all: "रद्द करें",
        btn_clear_queue: "कतार साफ करें",
        download_queue: "डाउनलोड कतार",
        queue_empty_desc: "कतार खाली है। लिंक पेस्ट करें और डाउनलोड शुरू करें!",
        customize_theme: "थीम रंग अनुकूलित करें",
        btn_save_changes: "परिवर्तन सहेजें",
        btn_reset_default: "डिफ़ॉल्ट पर सेट करें",
        customize_theme_desc: "एप्लिकेशन के मुख्य रंगों को समायोजित करें। लागू करने के लिए \"परिवर्तन सहेजें\" पर क्लिक करें।",
        primary_color_label: "प्राथमिक रंग (बटन, हाइलाइट्स)",
        secondary_color_label: "द्वितीयक रंग (गति, प्रगति बार)",
        accent_color_label: "उच्चारण रंग (पूर्ण बैज)",
        bg_color_label: "मूल पृष्ठभूमि रंग",
        interface_language: "इंटरफ़ेस की भाषा",
        download_history: "डाउनलोड इतिहास",
        downloads_folder: "डाउनलोड फ़ोल्डर खोलें",
        clear_history: "इतिहास साफ करें",
        th_filename: "फ़ाइल का नाम",
        th_source_url: "स्रोत URL",
        th_datetime: "दिनांक/समय",
        th_status: "स्थिति",
        about_title: "Rocket DL के बारे में",
        about_description: "Rocket DL एक प्रीमियम, उच्च गति वाला डाउनलोड मैनेजर है जिसे कतार-आधारित मल्टी-थ्रेडेड डाउनलोड के लिए डिज़ाइन किया गया है।",
        dev_linkedin: "डेवलपर LinkedIn:",
        github_account: "GitHub खाता:",
        github_profile: "GitHub प्रोफ़ाइल",
        console_title: "इंजन कंसोल आउटपुट",
        clear_console: "कंसोल साफ करें",
        console_ready: "[सिस्टम] इंजन तैयार है। कार्य की प्रतीक्षा की जा रही है...",
        yt_quality_title: "YouTube गुणवत्ता सेटिंग्स",
        yt_quality_desc: "आपकी कतार में YouTube लिंक का पता चला। कृपया गुणवत्ता विकल्प चुनें:",
        yt_opt_1: "सर्वश्रेष्ठ गुणवत्ता संयुक्त (4K/60fps तक)",
        yt_opt_2: "1080p 60fps (या सर्वोत्तम उपलब्ध)",
        yt_opt_3: "1080p 30fps (स्थान बचाता है)",
        yt_opt_4: "720p 60fps (या सर्वोत्तम उपलब्ध)",
        yt_opt_5: "720p 30fps (स्थान बचाता है)",
        yt_opt_6: "केवल ऑडियो (MP3 प्रारूप)",
        modal_cancel: "रद्द करें",
        modal_confirm_start: "पुष्टि करें और शुरू करें",
        stop_modal_title: "सभी डाउनलोड रोकें?",
        stop_modal_desc: "क्या आप निश्चित हैं? आप वर्तमान डाउनलोड को फिर से शुरू नहीं कर पाएंगे।",
        stop_modal_chk: "यह चेतावनी दोबारा न दिखाएं",
        modal_stop_yes: "हाँ, रोकें",
        disk_space_template: "{path} (खाली स्थान: {total} में से {free})",
        status_completed: "पूरा हुआ",
        status_deleted: "हटाया गया",
        status_cancelled: "रद्द किया गया",
        status_queued: "कतार में",
        status_failed: "विफल",
        status_pending: "लंबित...",
        status_analyzing: "लिंक का विश्लेषण किया जा रहा है...",
        status_ytdlp: "yt-dlp के माध्यम से डाउनलोड हो रहा है...",
        status_downloading: "डाउनलोड हो रहा है...",
        status_downloading_simple: "डाउनलोड हो रहा है",
        status_page_loaded: "पेज लोड हो गया, पॉपअप का इंतजार है...",
        status_fetching: "पॉपअप बंद। फ़ाइल प्राप्त की जा रही है...",
        status_fail_btn: "विफल: बटन नहीं मिला",
        status_fail_timeout: "विफल: समय समाप्त",
        status_error_prefix: "त्रुटि:",
        history_empty: "कोई डाउनलोड इतिहास उपलब्ध नहीं है।",
        bg_music_title: "पृष्ठभूमि संगीत",
        btn_play: "चलाएं",
        btn_pause: "रोकें",
        lbl_volume: "ध्वनि",
        chk_disable_startup: "स्टार्टअप पर संगीत चलाएं",
        nav_thanks: "विशेष धन्यवाद",
        connect_me_on: "मुझसे जुड़ें:"
    },
    ar: {
        splash_status: "جاري تهيئة المحرك...",
        sidebar_subtitle: "محرك التحميل",
        nav_downloads: "التنزيلات",
        nav_history: "السجل",
        nav_log: "سجل النظام",
        nav_customize: "تخصيص",
        nav_about: "حول التطبيق",
        engine_status_idle: "المحرك: خامل",
        engine_status_downloading: "المحرك: جاري التنزيل",
        engine_status_paused: "المحرك: متوقف مؤقتاً",
        save_location: "مكان الحفظ:",
        choose_directory: "اختيار المجلد",
        add_urls: "إضافة الروابط إلى الطابور",
        queue_count_template: "{n} عناصر",
        url_placeholder: "ألصق روابط التحميل هنا...\nمثال: https://example.com/file1\nhttps://example.com/file2",
        btn_proceed: "استمرار",
        btn_clear: "مسح",
        btn_add_more: "إضافة روابط أخرى",
        drag_to_reorder: "اسحب لإعادة ترتيب تسلسل التحميل",
        btn_start_process: "بدء التحميل",
        btn_pause_queue: "إيقاف الطابور",
        btn_resume_queue: "استئناف الطابور",
        btn_stop_all: "إيقاف كل التنزيلات",
        btn_clear_queue: "مسح الطابور",
        download_queue: "طابور التحميل",
        queue_empty_desc: "الطابور فارغ. ألصق الروابط وابدأ التحميل!",
        customize_theme: "تخصيص ألوان المظهر",
        btn_save_changes: "حفظ التغييرات",
        btn_reset_default: "المظهر الافتراضي",
        customize_theme_desc: "قم بتعديل الألوان الأساسية للتطبيق. انقر فوق \"حفظ التغييرات\" للتثبيت.",
        primary_color_label: "اللون الأساسي (الأزرار، التمييز)",
        secondary_color_label: "اللون الثانوي (السرعة، شريط التقدم)",
        accent_color_label: "لون التأكيد (العلامات المكتملة)",
        bg_color_label: "لون الخلفية الأساسي",
        interface_language: "لغة الواجهة",
        download_history: "سجل التنزيلات",
        downloads_folder: "فتح مجلد التنزيلات",
        clear_history: "مسح السجل",
        th_filename: "اسم الملف",
        th_source_url: "الرابط المصدر",
        th_datetime: "التاريخ/الوقت",
        th_status: "الحالة",
        about_title: "حول Rocket DL",
        about_description: "Rocket DL هو مدير تنزيل متميز وعالي السرعة مصمم للتنزيلات متعددة الخيوط القائمة على طابور واستخراج قوائم تشغيل YouTube تلقائياً.",
        dev_linkedin: "المطور LinkedIn:",
        github_account: "حساب GitHub:",
        github_profile: "ملف GitHub الشخصي",
        console_title: "خرج لوحة تحكم المحرك",
        clear_console: "مسح اللوحة",
        console_ready: "[النظام] المحرك جاهز. في انتظار المهام...",
        yt_quality_title: "إعدادات جودة YouTube",
        yt_quality_desc: "تم اكتشاف روابط YouTube في الطابور. يرجى اختيار الجودة:",
        yt_opt_1: "أفضل جودة مدمجة (حتى 4K/60 إطار في الثانية)",
        yt_opt_2: "جودة 1080p بمعدل 60 إطار (أو الأفضل المتاح)",
        yt_opt_3: "جودة 1080p بمعدل 30 إطار (توفير المساحة)",
        yt_opt_4: "جودة 720p بمعدل 60 إطار (أو الأفضل المتاح)",
        yt_opt_5: "جودة 720p بمعدل 30 إطار (توفير المساحة)",
        yt_opt_6: "صوت فقط (صيغة MP3)",
        modal_cancel: "إلغاء",
        modal_confirm_start: "تأكيد وبدء",
        stop_modal_title: "إيقاف كل التنزيلات؟",
        stop_modal_desc: "هل أنت متأكد؟ لن تتمكن من استئناف التنزيلات الحالية.",
        stop_modal_chk: "عدم إظهار هذا التحذير مرة أخرى",
        modal_stop_yes: "نعم، إيقاف",
        disk_space_template: "{path} (المساحة الخالية: {free} من {total})",
        status_completed: "مكتمل",
        status_deleted: "محذوف",
        status_cancelled: "ملغى",
        status_queued: "في الانتظار",
        status_failed: "فشل",
        status_pending: "قيد الانتظار...",
        status_analyzing: "تحليل الرابط...",
        status_ytdlp: "جاري التحميل عبر yt-dlp...",
        status_downloading: "جاري التحميل...",
        status_downloading_simple: "جاري التحميل",
        status_page_loaded: "تم تحميل الصفحة، في انتظار النافذة المنبثقة...",
        status_fetching: "تم إغلاق النافذة. جاري جلب الملف...",
        status_fail_btn: "فشل: لم يتم العثور على الزر",
        status_fail_timeout: "فشل: انتهت المهلة",
        status_error_prefix: "خطأ:",
        history_empty: "لا يوجد سجل تنزيلات متاح.",
        bg_music_title: "الموسيقى الخلفية",
        btn_play: "تشغيل",
        btn_pause: "إيقاف مؤقت",
        lbl_volume: "مستوى الصوت",
        chk_disable_startup: "تشغيل الموسيقى عند بدء التشغيل",
        nav_thanks: "شكر خاص",
        connect_me_on: "تواصل معي على:"
    }
};

function getStatusTranslation(status) {
    if (!status) return '';
    const statusLower = status.toLowerCase();
    const lang = window.currentLanguage || 'en';
    
    if (statusLower === 'queued') return translations[lang]['status_queued'] || 'Queued';
    if (statusLower === 'completed') return translations[lang]['status_completed'] || 'Completed';
    if (statusLower === 'failed' || statusLower === 'cancelled' || statusLower === 'canceled') return translations[lang]['status_failed'] || 'Failed';
    if (statusLower === 'downloading...') return translations[lang]['status_downloading'] || 'Downloading...';
    if (statusLower === 'downloading') return translations[lang]['status_downloading_simple'] || 'Downloading';
    if (statusLower === 'page loaded, waiting for popup...') return translations[lang]['status_page_loaded'] || 'Page loaded, waiting for popup...';
    if (statusLower === 'popup closed. fetching file...') return translations[lang]['status_fetching'] || 'Popup closed. Fetching file...';
    if (statusLower === 'failed: button not found') return translations[lang]['status_fail_btn'] || 'Failed: Button not found';
    if (statusLower === 'failed: timeout') return translations[lang]['status_fail_timeout'] || 'Failed: Timeout';
    if (statusLower.startsWith('error:')) {
        const errMsg = status.substring(6).trim();
        return (translations[lang]['status_error_prefix'] || 'Error:') + ' ' + errMsg;
    }
    
    return status;
}

function updateEngineStatusDisplay() {
    const lang = window.currentLanguage || 'en';
    if (window.engineState === 'downloading') {
        engineStatusText.textContent = translations[lang]['engine_status_downloading'];
        btnPauseText.textContent = translations[lang]['btn_pause_queue'];
    } else if (window.engineState === 'paused') {
        engineStatusText.textContent = translations[lang]['engine_status_paused'];
        btnPauseText.textContent = translations[lang]['btn_resume_queue'];
    } else {
        engineStatusText.textContent = translations[lang]['engine_status_idle'];
        btnPauseText.textContent = translations[lang]['btn_pause_queue'];
    }
}

function applyLanguage(lang) {
    if (!translations[lang]) lang = 'en';
    window.currentLanguage = lang;
    
    const selectLang = document.getElementById('select-language');
    if (selectLang) {
        selectLang.value = lang;
    }
    
    if (lang === 'ar') {
        document.documentElement.setAttribute('dir', 'rtl');
        document.documentElement.setAttribute('lang', 'ar');
    } else {
        document.documentElement.removeAttribute('dir');
        document.documentElement.setAttribute('lang', lang);
    }
    
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
    
    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[lang][key]) {
            el.setAttribute('placeholder', translations[lang][key]);
        }
    });
    
    updateQueueState();
    updateEngineStatusDisplay();
    updateDownloadPathDisplay(null, null);
    loadHistory();
}

// Generate a simple hash for URL to use as DOM element ID
function getUrlId(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        hash = (hash << 5) - hash + url.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return 'url-' + Math.abs(hash);
}

// Update the queue count UI and handle empty state visibility
function updateQueueState() {
    const template = translations[window.currentLanguage || 'en']['queue_count_template'] || '{n} items';
    queueCountBadge.textContent = template.replace('{n}', queueItems.length);
    if (queueItems.length === 0) {
        queueEmptyState.style.display = 'flex';
    } else {
        queueEmptyState.style.display = 'none';
    }
}

// Show the download queue panel and make grid 2 columns
function showQueuePanel() {
    if (queuePanelSection) {
        queuePanelSection.classList.remove('hidden');
    }
    if (contentGrid) {
        contentGrid.classList.remove('single-col');
    }
}

// Hide the download queue panel and make grid 1 column (full width input)
function hideQueuePanel() {
    if (queuePanelSection) {
        queuePanelSection.classList.add('hidden');
    }
    if (contentGrid) {
        contentGrid.classList.add('single-col');
    }
}



// Update the save location path label with parent drive disk metrics
async function updateDownloadPathDisplay(api, path) {
    if (path) {
        window.lastDownloadPath = path;
    } else {
        path = window.lastDownloadPath;
    }
    if (!path) return;
    try {
        if (!api) api = await getPythonApi();
        const diskSpace = await api.get_disk_space();
        if (diskSpace && !diskSpace.error) {
            const freeText = formatBytes(diskSpace.free, 1);
            const totalText = formatBytes(diskSpace.total, 1);
            const template = translations[window.currentLanguage || 'en']['disk_space_template'] || '{path} (Free Space: {free} of {total})';
            lblDownloadPath.textContent = template
                .replace('{path}', path)
                .replace('{free}', freeText)
                .replace('{total}', totalText);
        } else {
            lblDownloadPath.textContent = path;
        }
    } catch (err) {
        lblDownloadPath.textContent = path;
    }
}

// Re-render the entire queue based on text inputs
function parseAndBuildQueue() {
    const text = urlInputs.value;
    const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    if (lines.length > 0) {
        // Build new list preserving state of existing entries
        const existingItems = {};
        queueItems.forEach(item => {
            existingItems[item.url] = item;
        });

        // Add any URLs that aren't already in the queue
        lines.forEach(url => {
            const alreadyExists = queueItems.some(item => item.url === url);
            if (!alreadyExists) {
                queueItems.push({
                    url: url,
                    id: getUrlId(url),
                    status: 'queued',
                    filename: ''
                });
            }
        });

        // Clear textarea so it is empty next time they click Add More Links
        urlInputs.value = '';
    }

    // Show or hide reorder list based on whether there are URLs and user has proceeded
    if (reorderListContainer) {
        if (queueItems.length > 0 && hasProceeded) {
            reorderListContainer.classList.remove('hidden-el');
            buildReorderList();
        } else {
            reorderListContainer.classList.add('hidden-el');
            if (reorderList) {
                reorderList.innerHTML = '';
            }
        }
    }

    if (queueItems.length === 0) {
        hasProceeded = false;
        if (initialActions) initialActions.classList.remove('hidden-el');
        if (processActions) processActions.classList.add('hidden-el');
        if (urlInputs) urlInputs.classList.remove('hidden-el');
        if (addMoreContainer) addMoreContainer.classList.add('hidden-el');
    }
    
    renderQueueList();
    updateQueueState();
}

// Render the queue panel list in the UI
function renderQueueList() {
    // Clear and redraw container
    const activeItems = queueList.querySelectorAll('.download-item');
    activeItems.forEach(el => el.remove());

    queueItems.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'download-item';
        itemEl.id = item.id;
        
        let statusClass = 'queued';
        let statusText = translations[window.currentLanguage || 'en']['status_queued'] || 'Queued';
        if (item.status === 'downloading' || item.status.includes('downloading')) {
            statusClass = 'running';
            statusText = getStatusTranslation(item.status);
        } else if (item.status === 'completed' || item.status.toLowerCase() === 'completed') {
            statusClass = 'completed';
            statusText = translations[window.currentLanguage || 'en']['status_completed'] || 'Completed';
        } else if (item.status.includes('failed') || item.status.includes('error') || item.status.includes('fail')) {
            statusClass = 'failed';
            statusText = translations[window.currentLanguage || 'en']['status_failed'] || 'Failed';
        } else if (item.status && item.status !== 'queued') {
            statusClass = 'running';
            statusText = getStatusTranslation(item.status);
        }

        itemEl.innerHTML = `
            <div class="download-item-header">
                <div style="display: flex; align-items: center; gap: 8px; max-width: 75%;">
                    <span class="queue-index-badge">${index + 1}</span>
                    <span class="download-url" title="${escapeHTML(item.url)}">${escapeHTML(item.url)}</span>
                </div>
                <span class="download-status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="download-item-body">
                <span class="download-filename">${item.filename || translations[window.currentLanguage || 'en']['status_pending'] || 'Pending...'}</span>
            </div>
            <div class="download-progress-container" style="display: none;">
                <div class="download-progress-bar-wrapper">
                    <div class="download-progress-bar" style="width: 0%;"></div>
                </div>
                <div class="download-progress-details">
                    <span class="download-speed">0 KB/s</span>
                    <span class="download-progress-text">0% (0 Bytes / 0 Bytes)</span>
                </div>
            </div>
        `;
        queueList.appendChild(itemEl);

        // Restore active progress graphics if item is downloading
        if (item.progress && (item.status === 'downloading' || item.status.includes('downloading'))) {
            const progressContainer = itemEl.querySelector('.download-progress-container');
            const progressBar = itemEl.querySelector('.download-progress-bar');
            const speedEl = itemEl.querySelector('.download-speed');
            const progressTextEl = itemEl.querySelector('.download-progress-text');
            if (progressContainer) progressContainer.style.display = 'flex';
            if (progressBar) progressBar.style.width = `${item.progress.percent}%`;
            if (speedEl) speedEl.textContent = formatSpeed(item.progress.speed);
            if (progressTextEl) {
                if (item.progress.total > 0) {
                    progressTextEl.textContent = `${item.progress.percent}% (${formatBytes(item.progress.received)} / ${formatBytes(item.progress.total)})`;
                } else {
                    progressTextEl.textContent = `${formatBytes(item.progress.received)}`;
                }
            }
        }
    });
}

// Build the draggable reorder list below the paste box
let dragSrcEl = null;

function buildReorderList() {
    reorderList.innerHTML = '';
    queueItems.forEach((item, index) => {
        const reorderItem = document.createElement('div');
        reorderItem.className = 'reorder-item';
        reorderItem.draggable = true;
        reorderItem.dataset.index = index;
        reorderItem.innerHTML = `
            <span class="reorder-grip">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="5" r="2"/><circle cx="17" cy="5" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></svg>
            </span>
            <span class="reorder-index">${index + 1}</span>
            <span class="reorder-url" title="${escapeHTML(item.url)}">${escapeHTML(item.url)}</span>
            <button class="btn-delete-item" data-index="${index}" title="Remove link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
            </button>
        `;

        reorderItem.addEventListener('dragstart', handleDragStart);
        reorderItem.addEventListener('dragover', handleDragOver);
        reorderItem.addEventListener('dragenter', handleDragEnter);
        reorderItem.addEventListener('dragleave', handleDragLeave);
        reorderItem.addEventListener('drop', handleDrop);
        reorderItem.addEventListener('dragend', handleDragEnd);

        // Add click listener to the dustbin button
        const deleteBtn = reorderItem.querySelector('.btn-delete-item');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const deleteIndex = parseInt(deleteBtn.dataset.index);
                
                // Remove from queue
                queueItems.splice(deleteIndex, 1);
                
                // Re-render
                buildReorderList();
                updateQueueState();
                
                // If queue becomes empty, reset back to initial state!
                if (queueItems.length === 0) {
                    hasProceeded = false;
                    if (initialActions) initialActions.classList.remove('hidden-el');
                    if (processActions) processActions.classList.add('hidden-el');
                    if (urlInputs) urlInputs.classList.remove('hidden-el');
                    if (addMoreContainer) addMoreContainer.classList.add('hidden-el');
                    hideQueuePanel();
                } else {
                    renderQueueList();
                }
            });
        }

        reorderList.appendChild(reorderItem);
    });
}

function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    this.classList.add('drag-over');
}

function handleDragLeave() {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    this.classList.remove('drag-over');

    if (dragSrcEl !== this) {
        const fromIndex = parseInt(dragSrcEl.dataset.index);
        const toIndex = parseInt(this.dataset.index);

        // Move the item directly inside our queueItems array
        const [moved] = queueItems.splice(fromIndex, 1);
        queueItems.splice(toIndex, 0, moved);

        // Rebuild reorder list and redraw queue list panel
        buildReorderList();
        renderQueueList();
    }
}

function handleDragEnd() {
    this.classList.remove('dragging');
    reorderList.querySelectorAll('.reorder-item').forEach(item => {
        item.classList.remove('drag-over');
        item.classList.remove('dragging');
    });
}

// Helper to safely fetch the PyWebView Python API
async function getPythonApi() {
    if (window.pywebview && window.pywebview.api) {
        return window.pywebview.api;
    }
    return new Promise(resolve => {
        // Fallback polling to avoid race conditions if the ready event was already fired
        const interval = setInterval(() => {
            if (window.pywebview && window.pywebview.api) {
                clearInterval(interval);
                resolve(window.pywebview.api);
            }
        }, 15);

        window.addEventListener('pywebviewready', () => {
            clearInterval(interval);
            resolve(window.pywebview.api);
        });
    });
}

// Event Listeners

async function startQueueDownloads(urls) {
    showQueuePanel();
    js_log("System", `Starting downloads queue of ${urls.length} items...`);
    try {
        const api = await getPythonApi();
        const result = await api.start_downloads(urls, true);
        js_log("System", `Python engine feedback: ${result}`);
    } catch (e) {
        js_log("Error", `Communication error: ${e.message}`);
    }
}

btnStart.addEventListener('click', async () => {
    if (queueItems.length === 0) {
        js_log("System", "Error: No links in the queue. Please paste links first.");
        return;
    }

    const urls = queueItems.map(item => item.url);
    const hasYoutube = urls.some(url => url.includes('youtube.com') || url.includes('youtu.be'));

    if (hasYoutube) {
        // Show quality select modal
        ytQualityModal.classList.remove('hidden');
    } else {
        await startQueueDownloads(urls);
    }
});

btnYtModalCancel.addEventListener('click', () => {
    ytQualityModal.classList.add('hidden');
});

btnYtModalConfirm.addEventListener('click', async () => {
    ytQualityModal.classList.add('hidden');
    const selectedQuality = selectModalYtQuality.value;
    try {
        const api = await getPythonApi();
        // Save the quality setting to backend config
        await api.save_config_value("yt_quality_default", selectedQuality);
        js_log("System", `Target YouTube quality set to: ${selectedQuality}`);
    } catch (e) {
        console.error("Failed to save YouTube quality selection:", e);
    }
    const urls = queueItems.map(item => item.url);
    await startQueueDownloads(urls);
});

btnPause.addEventListener('click', async () => {
    try {
        const api = await getPythonApi();
        if (btnPauseText.textContent === "Pause Queue") {
            js_log("System", "Requesting engine to pause...");
            await api.pause_downloads();
        } else {
            js_log("System", "Requesting engine to resume...");
            await api.resume_downloads();
        }
    } catch (e) {
        js_log("Error", `Communication error: ${e.message}`);
    }
});

const triggerStop = async () => {
    js_log("System", "Requesting engine to stop...");
    try {
        const api = await getPythonApi();
        await api.stop_downloads();
        await api.clear_temp_files();
    } catch (e) {
        js_log("Error", `Communication error: ${e.message}`);
    }
};

btnStop.addEventListener('click', () => {
    const hideWarning = appConfig.hide_stop_warning === true;
    if (hideWarning) {
        triggerStop();
    } else {
        if (chkDontShow) chkDontShow.checked = false;
        confirmModal.classList.remove('hidden');
    }
});

btnModalCancel.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    js_log("System", "Stop cancelled. Continuing downloads...");
});

btnModalConfirm.addEventListener('click', async () => {
    if (chkDontShow && chkDontShow.checked) {
        appConfig.hide_stop_warning = true;
        try {
            const api = await getPythonApi();
            await api.save_config_value('hide_stop_warning', true);
        } catch (e) {
            console.error("Failed to save stop warning config:", e);
        }
    }
    confirmModal.classList.add('hidden');
    await triggerStop();
});

btnClear.addEventListener('click', async () => {
    urlInputs.value = '';
    hasProceeded = false;
    parseAndBuildQueue();
    
    if (initialActions) initialActions.classList.remove('hidden-el');
    if (reorderListContainer) reorderListContainer.classList.add('hidden-el');
    if (processActions) processActions.classList.add('hidden-el');
    if (urlInputs) urlInputs.classList.remove('hidden-el');
    if (addMoreContainer) addMoreContainer.classList.add('hidden-el');

    // Hide queue panel and collapse grid back to full width input
    hideQueuePanel();
    
    js_log("System", "Queue cleared.");
    
    try {
        const api = await getPythonApi();
        await api.clear_temp_files();
    } catch (e) {
        console.error("Failed to clear temp files:", e);
    }
});

btnOpenFolder.addEventListener('click', async () => {
    try {
        const api = await getPythonApi();
        await api.open_downloads_folder();
        js_log("System", "Opened downloads folder.");
    } catch (e) {
        js_log("Error", `Failed to open folder: ${e.message}`);
    }
});

btnChangePath.addEventListener('click', async () => {
    try {
        const api = await getPythonApi();
        const newPath = await api.select_download_directory();
        if (newPath) {
            await updateDownloadPathDisplay(api, newPath);
            js_log("System", `Download destination set to: ${newPath}`);
        }
    } catch (e) {
        js_log("Error", `Failed to change directory: ${e.message}`);
    }
});
btnClearConsole.addEventListener('click', () => {
    consoleBox.innerHTML = '';
    js_log("System", "Console logs cleared.");
});

// Tab Switching Event Listeners
navDownloads.addEventListener('click', () => {
    navDownloads.classList.add('active');
    navConsole.classList.remove('active');
    navHistory.classList.remove('active');
    navCustomize.classList.remove('active');
    navAbout.classList.remove('active');
    if (navThanks) navThanks.classList.remove('active');
    
    // Switch active containers with entry transitions
    contentGrid.classList.remove('hidden');
    contentGrid.classList.remove('fade-in');
    void contentGrid.offsetWidth; // Trigger reflow
    contentGrid.classList.add('fade-in');
    
    historySection.classList.add('hidden');
    customizeSection.classList.add('hidden');
    aboutSection.classList.add('hidden');
    if (thanksSection) thanksSection.classList.add('hidden');
    
    // Ensure console is hidden in downloads dashboard tab
    consoleSection.classList.add('hidden');
    consoleSection.classList.remove('full-height');
});

navConsole.addEventListener('click', () => {
    navConsole.classList.add('active');
    navDownloads.classList.remove('active');
    navHistory.classList.remove('active');
    navCustomize.classList.remove('active');
    navAbout.classList.remove('active');
    if (navThanks) navThanks.classList.remove('active');
    
    contentGrid.classList.add('hidden');
    historySection.classList.add('hidden');
    customizeSection.classList.add('hidden');
    aboutSection.classList.add('hidden');
    if (thanksSection) thanksSection.classList.add('hidden');
    consoleSection.classList.remove('hidden');
    
    consoleSection.classList.remove('full-height');
    consoleSection.classList.remove('fade-in');
    void consoleSection.offsetWidth; // Trigger reflow
    consoleSection.classList.add('full-height');
    consoleSection.classList.add('fade-in');
});

navHistory.addEventListener('click', () => {
    navHistory.classList.add('active');
    navDownloads.classList.remove('active');
    navConsole.classList.remove('active');
    navCustomize.classList.remove('active');
    navAbout.classList.remove('active');
    
    contentGrid.classList.add('hidden');
    consoleSection.classList.add('hidden');
    customizeSection.classList.add('hidden');
    aboutSection.classList.add('hidden');
    
    historySection.classList.remove('hidden');
    historySection.classList.remove('fade-in');
    void historySection.offsetWidth; // Trigger reflow
    historySection.classList.add('fade-in');
    
    loadHistory();
});

navCustomize.addEventListener('click', () => {
    navCustomize.classList.add('active');
    navDownloads.classList.remove('active');
    navConsole.classList.remove('active');
    navHistory.classList.remove('active');
    navAbout.classList.remove('active');
    if (navThanks) navThanks.classList.remove('active');
    
    contentGrid.classList.add('hidden');
    consoleSection.classList.add('hidden');
    historySection.classList.add('hidden');
    aboutSection.classList.add('hidden');
    if (thanksSection) thanksSection.classList.add('hidden');
    
    customizeSection.classList.remove('hidden');
    customizeSection.classList.remove('fade-in');
    void customizeSection.offsetWidth; // Trigger reflow
    customizeSection.classList.add('fade-in');
});

navAbout.addEventListener('click', () => {
    navAbout.classList.add('active');
    navDownloads.classList.remove('active');
    navConsole.classList.remove('active');
    navHistory.classList.remove('active');
    navCustomize.classList.remove('active');
    if (navThanks) navThanks.classList.remove('active');
    
    contentGrid.classList.add('hidden');
    consoleSection.classList.add('hidden');
    historySection.classList.add('hidden');
    customizeSection.classList.add('hidden');
    if (thanksSection) thanksSection.classList.add('hidden');
    
    aboutSection.classList.remove('hidden');
    aboutSection.classList.remove('fade-in');
    void aboutSection.offsetWidth; // Trigger reflow
    aboutSection.classList.add('fade-in');
});

if (navThanks) {
    navThanks.addEventListener('click', () => {
        navThanks.classList.add('active');
        navDownloads.classList.remove('active');
        navConsole.classList.remove('active');
        navHistory.classList.remove('active');
        navCustomize.classList.remove('active');
        navAbout.classList.remove('active');
        
        contentGrid.classList.add('hidden');
        consoleSection.classList.add('hidden');
        historySection.classList.add('hidden');
        customizeSection.classList.add('hidden');
        aboutSection.classList.add('hidden');
        
        if (thanksSection) {
            thanksSection.classList.remove('hidden');
            thanksSection.classList.remove('fade-in');
            void thanksSection.offsetWidth; // Trigger reflow
            thanksSection.classList.add('fade-in');
        }
    });
}

btnClearHistory.addEventListener('click', async () => {
    try {
        const api = await getPythonApi();
        await api.clear_history();
        await loadHistory();
    } catch (e) {
        console.error("Failed to clear history:", e);
    }
});

function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

const loadHistory = async () => {
    try {
        const api = await getPythonApi();
        const records = await api.get_history();
        
        historyListBody.innerHTML = '';
        if (records.length === 0) {
            const emptyRow = document.createElement('tr');
            const emptyMsg = translations[window.currentLanguage || 'en']['history_empty'] || 'No download history available.';
            emptyRow.innerHTML = `<td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">${emptyMsg}</td>`;
            historyListBody.appendChild(emptyRow);
            return;
        }
        
        records.forEach(r => {
            const row = document.createElement('tr');
            
            const cleanUrl = r.url || '';
            const shortUrl = cleanUrl.length > 50 ? cleanUrl.substring(0, 47) + '...' : cleanUrl;
            
            let statusText = r.status || '';
            const statusLower = statusText.toLowerCase();
            let badgeClass = 'cancelled';
            if (statusLower === 'completed') {
                badgeClass = 'completed';
                statusText = translations[window.currentLanguage || 'en']['status_completed'] || 'Completed';
            } else if (statusLower === 'deleted') {
                badgeClass = 'deleted';
                statusText = translations[window.currentLanguage || 'en']['status_deleted'] || 'Deleted';
            } else if (statusLower === 'cancelled' || statusLower === 'failed') {
                badgeClass = 'cancelled';
                statusText = translations[window.currentLanguage || 'en']['status_failed'] || 'Failed';
            }
            
            row.innerHTML = `
                <td style="font-weight: 500; color: var(--text-main); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(r.filename)}</td>
                <td title="${escapeHtml(cleanUrl)}" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(shortUrl)}</td>
                <td>${escapeHtml(r.timestamp)}</td>
                <td><span class="status-badge ${badgeClass}">${escapeHtml(statusText)}</span></td>
            `;
            historyListBody.appendChild(row);
        });
    } catch (e) {
        console.error("Failed to load history:", e);
    }
};

// exposed javascript functions that PyWebView can evaluate
window.js_on_downloads_started = function() {
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
    urlInputs.disabled = true;
    btnClear.disabled = true;
    btnChangePath.disabled = true;
    
    // Ensure the queue panel is visible with smooth grid transition
    showQueuePanel();
    
    engineStatusDot.className = 'pulse-dot running';
    window.engineState = 'downloading';
    updateEngineStatusDisplay();
};

window.js_on_downloads_completed = function() {
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    urlInputs.disabled = false;
    btnClear.disabled = false;
    btnChangePath.disabled = false;
    
    engineStatusDot.className = 'pulse-dot idle';
    window.engineState = 'idle';
    updateEngineStatusDisplay();

    // Trigger completion log
    js_log("System", "Rocket landed successfully");

    try {
        if (Notification.permission === "granted") {
            new Notification("Rocket DL", {
                body: "Rocket landed successfully",
                icon: "logo.png"
            });
        }
    } catch (e) {
        console.error("OS Notification error:", e);
    }
};

window.js_on_downloads_paused = function() {
    engineStatusDot.className = 'pulse-dot paused';
    window.engineState = 'paused';
    updateEngineStatusDisplay();
};

window.js_log = function(level, message) {
    const line = document.createElement('div');
    line.className = `console-line ${level.toLowerCase()}`;
    
    const timestamp = new Date().toLocaleTimeString();
    
    // Create timestamp element
    const timeSpan = document.createElement('span');
    timeSpan.className = 'console-time';
    timeSpan.textContent = `[${timestamp}] `;
    
    // Create level tag element
    const tagSpan = document.createElement('span');
    tagSpan.className = `console-tag console-tag-${level.toLowerCase()}`;
    tagSpan.textContent = `[${level}] `;
    
    // Create message element
    const msgSpan = document.createElement('span');
    msgSpan.className = 'console-msg';
    msgSpan.textContent = message;
    
    line.appendChild(timeSpan);
    line.appendChild(tagSpan);
    line.appendChild(msgSpan);
    
    consoleBox.appendChild(line);
    consoleBox.scrollTop = consoleBox.scrollHeight;
};

window.js_update_active_url = function(url, status, filename = null) {
    const id = getUrlId(url);
    const itemEl = document.getElementById(id);
    if (!itemEl) return;

    // Cache the status and filename changes inside the local state array
    const cachedItem = queueItems.find(item => item.url === url);
    if (cachedItem) {
        cachedItem.status = status;
        if (filename) {
            cachedItem.filename = filename;
        }
    }

    const badge = itemEl.querySelector('.download-status-badge');
    const filenameEl = itemEl.querySelector('.download-filename');
    const progressContainer = itemEl.querySelector('.download-progress-container');

    // Update status badge class and text
    badge.className = 'download-status-badge';
    let cleanStatus = status.toLowerCase();

    if (cleanStatus === 'completed') {
        badge.classList.add('completed');
        badge.textContent = translations[window.currentLanguage || 'en']['status_completed'] || 'Completed';
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    } else if (cleanStatus.includes('error') || cleanStatus.includes('failed') || cleanStatus.includes('timed out') || cleanStatus.includes('timeout')) {
        badge.classList.add('failed');
        badge.textContent = translations[window.currentLanguage || 'en']['status_failed'] || 'Failed';
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    } else {
        badge.classList.add('running');
        badge.textContent = getStatusTranslation(status);
    }

    // Update filename if provided
    if (filename) {
        filenameEl.textContent = filename;
    }
};

// Formatter helper functions for file sizes and speeds
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
    return formatBytes(bytesPerSec, 1) + '/s';
}

// Convert Hex to Rgba for primary glow highlights
function hexToRgbA(hex, alpha) {
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x' + c.join('');
        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
    }
    return `rgba(255,107,107,${alpha})`;
}

// Global configuration cache
let appConfig = {};

// Color theme customization function
function applyCustomColors() {
    const primary = appConfig.custom_primary || '#ff6b6b';
    const secondary = appConfig.custom_secondary || '#4ecca3';
    const accent = appConfig.custom_accent || '#ffe66d';
    const bg = appConfig.custom_bg || '#0f0e17';
    
    document.documentElement.style.setProperty('--primary', primary);
    document.documentElement.style.setProperty('--primary-glow', hexToRgbA(primary, 0.2));
    document.documentElement.style.setProperty('--secondary', secondary);
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--bg-dark', bg);
    
    if (pickPrimary) pickPrimary.value = primary;
    if (pickSecondary) pickSecondary.value = secondary;
    if (pickAccent) pickAccent.value = accent;
    if (pickBg) pickBg.value = bg;
    
    if (hexPrimary) hexPrimary.textContent = primary.toUpperCase();
    if (hexSecondary) hexSecondary.textContent = secondary.toUpperCase();
    if (hexAccent) hexAccent.textContent = accent.toUpperCase();
    if (hexBg) hexBg.textContent = bg.toUpperCase();
}

// Set up event listeners for inputs
if (pickPrimary) {
    pickPrimary.addEventListener('input', (e) => {
        appConfig.custom_primary = e.target.value;
        applyCustomColors();
    });
}
if (pickSecondary) {
    pickSecondary.addEventListener('input', (e) => {
        appConfig.custom_secondary = e.target.value;
        applyCustomColors();
    });
}
if (pickAccent) {
    pickAccent.addEventListener('input', (e) => {
        appConfig.custom_accent = e.target.value;
        applyCustomColors();
    });
}
if (pickBg) {
    pickBg.addEventListener('input', (e) => {
        appConfig.custom_bg = e.target.value;
        applyCustomColors();
    });
}

const btnSaveTheme = document.getElementById('btn-save-theme');
if (btnSaveTheme) {
    btnSaveTheme.addEventListener('click', async () => {
        try {
            const api = await getPythonApi();
            await api.save_config_value('custom_primary', appConfig.custom_primary || null);
            await api.save_config_value('custom_secondary', appConfig.custom_secondary || null);
            await api.save_config_value('custom_accent', appConfig.custom_accent || null);
            await api.save_config_value('custom_bg', appConfig.custom_bg || null);
            
            js_log("System", "Theme changes saved successfully to configuration.");
            
            const originalText = btnSaveTheme.textContent;
            btnSaveTheme.textContent = "Saved!";
            btnSaveTheme.style.background = "var(--secondary)";
            btnSaveTheme.style.color = "#000";
            setTimeout(() => {
                btnSaveTheme.textContent = originalText;
                btnSaveTheme.style.background = "";
                btnSaveTheme.style.color = "";
            }, 1500);
        } catch (e) {
            console.error("Failed to save custom colors:", e);
            js_log("Error", "Failed to save theme changes.");
        }
    });
}

if (btnResetTheme) {
    btnResetTheme.addEventListener('click', async () => {
        delete appConfig.custom_primary;
        delete appConfig.custom_secondary;
        delete appConfig.custom_accent;
        delete appConfig.custom_bg;
        
        applyCustomColors();
        js_log("System", "Theme colors reset to default Coral & Mint.");
        
        const api = await getPythonApi();
        await api.save_config_value('custom_primary', null);
        await api.save_config_value('custom_secondary', null);
        await api.save_config_value('custom_accent', null);
        await api.save_config_value('custom_bg', null);
    });
}

if (selectLanguage) {
    selectLanguage.addEventListener('change', async (e) => {
        const lang = e.target.value;
        appConfig.language = lang;
        applyLanguage(lang);
        js_log("System", `Interface language changed to: ${lang.toUpperCase()}`);
        
        try {
            const api = await getPythonApi();
            await api.save_config_value('language', lang);
        } catch (err) {
            console.error("Failed to save language setting:", err);
        }
    });
}

function updateAudioButtonsUI(isPlaying) {
    if (!btnSoundPlay) return;
    const spanText = document.getElementById('sound-play-text');
    const playIcon = document.getElementById('sound-play-icon');
    
    if (isPlaying) {
        btnSoundPlay.style.background = "var(--primary)";
        btnSoundPlay.style.color = "#000";
        btnSoundPlay.style.fontWeight = "600";
        if (spanText) {
            spanText.setAttribute('data-i18n', 'btn_pause');
            spanText.textContent = translations[window.currentLanguage || 'en']['btn_pause'] || 'Pause';
        }
        if (playIcon) {
            playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
        }
    } else {
        btnSoundPlay.style.background = "";
        btnSoundPlay.style.color = "";
        btnSoundPlay.style.fontWeight = "";
        if (spanText) {
            spanText.setAttribute('data-i18n', 'btn_play');
            spanText.textContent = translations[window.currentLanguage || 'en']['btn_play'] || 'Play';
        }
        if (playIcon) {
            playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
        }
    }
}

function triggerMusicOnStartup() {
    let volume = 20;
    if (appConfig.bg_music_volume !== undefined && appConfig.bg_music_volume !== null) {
        volume = parseInt(appConfig.bg_music_volume);
    }
    bgAudio.volume = volume / 100;
    if (sliderSoundVolume) {
        sliderSoundVolume.value = volume;
    }
    if (lblSoundVolume) {
        lblSoundVolume.textContent = `${volume}%`;
    }

    let disableStartup = false;
    if (appConfig.bg_music_disable_startup !== undefined && appConfig.bg_music_disable_startup !== null) {
        disableStartup = !!appConfig.bg_music_disable_startup;
    }
    if (chkSoundDisableStartup) {
        chkSoundDisableStartup.checked = !disableStartup;
    }

    const shouldPlay = !disableStartup;
    
    if (shouldPlay) {
        bgAudio.play().catch(err => {
            console.log("Autoplay was prevented by browser/environment policy. User interaction required.", err);
        });
        updateAudioButtonsUI(true);
    } else {
        bgAudio.pause();
        updateAudioButtonsUI(false);
    }
}

if (btnSoundPlay) {
    btnSoundPlay.addEventListener('click', () => {
        const isCurrentlyPlaying = !bgAudio.paused;
        if (isCurrentlyPlaying) {
            bgAudio.pause();
            updateAudioButtonsUI(false);
        } else {
            bgAudio.play().catch(err => console.log("Audio play failed: ", err));
            updateAudioButtonsUI(true);
        }
    });
}

if (sliderSoundVolume) {
    sliderSoundVolume.addEventListener('input', async (e) => {
        const val = parseInt(e.target.value);
        bgAudio.volume = val / 100;
        if (lblSoundVolume) {
            lblSoundVolume.textContent = `${val}%`;
        }
        appConfig.bg_music_volume = val;
        
        try {
            const api = await getPythonApi();
            await api.save_config_value('bg_music_volume', val);
        } catch (err) {
            console.error("Failed to save music volume:", err);
        }
    });
}

if (chkSoundDisableStartup) {
    chkSoundDisableStartup.addEventListener('change', async (e) => {
        const playOnStartup = e.target.checked;
        const disableStartup = !playOnStartup;
        appConfig.bg_music_disable_startup = disableStartup;
        
        try {
            const api = await getPythonApi();
            await api.save_config_value('chk_sound_disable_startup', disableStartup);
            await api.save_config_value('bg_music_disable_startup', disableStartup);
        } catch (err) {
            console.error("Failed to save music startup preference:", err);
        }
    });
}

// JS callback for real-time progress update
window.js_update_download_progress = function(url, state, percent, speed, received, total) {
    const id = getUrlId(url);
    const itemEl = document.getElementById(id);
    if (!itemEl) return;

    // Cache active progress metrics in local state array
    const cachedItem = queueItems.find(item => item.url === url);
    if (cachedItem) {
        cachedItem.status = state;
        cachedItem.progress = { percent, speed, received, total };
    }

    const badge = itemEl.querySelector('.download-status-badge');
    const progressContainer = itemEl.querySelector('.download-progress-container');
    const progressBar = itemEl.querySelector('.download-progress-bar');
    const speedEl = itemEl.querySelector('.download-speed');
    const progressTextEl = itemEl.querySelector('.download-progress-text');

    if (progressContainer && progressContainer.style.display === 'none') {
        progressContainer.style.display = 'flex';
    }

    if (badge) {
        badge.className = 'download-status-badge running';
        badge.textContent = percent > 0 ? `Downloading ${percent}%` : 'Downloading';
    }

    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }

    if (speedEl) {
        speedEl.textContent = formatSpeed(speed);
    }

    if (progressTextEl) {
        if (total > 0) {
            progressTextEl.textContent = `${percent}% (${formatBytes(received)} / ${formatBytes(total)})`;
        } else {
            progressTextEl.textContent = `${formatBytes(received)}`;
        }
    }
};



// External browser redirection helper for standard class="external-link" tags
document.addEventListener('click', async (e) => {
    const targetLink = e.target.closest('a.external-link, button.external-link');
    if (targetLink) {
        e.preventDefault();
        const url = targetLink.getAttribute('href') || targetLink.getAttribute('data-href');
        if (url) {
            try {
                const api = await getPythonApi();
                await api.open_external_url(url);
            } catch (err) {
                console.error("Failed to open external URL:", url, err);
            }
        }
    }
});


if (btnProceed) {
    btnProceed.addEventListener('click', () => {
        const text = urlInputs.value.trim();
        if (!text) {
            urlInputs.focus();
            urlInputs.style.borderColor = 'var(--danger)';
            setTimeout(() => {
                urlInputs.style.borderColor = '';
            }, 1000);
            return;
        }

        hasProceeded = true;
        if (btnBack) btnBack.classList.add('hidden');

        // Parse and populate the reorder list and queue
        parseAndBuildQueue();

        // Slide/fade transitions
        if (urlInputs) urlInputs.classList.add('hidden-el');
        if (initialActions) initialActions.classList.add('hidden-el');
        if (addMoreContainer) addMoreContainer.classList.remove('hidden-el');
        if (reorderListContainer) reorderListContainer.classList.remove('hidden-el');
        if (processActions) processActions.classList.remove('hidden-el');
    });
}

if (btnBack) {
    btnBack.addEventListener('click', () => {
        hasProceeded = true;
        if (urlInputs) urlInputs.classList.add('hidden-el');
        if (initialActions) initialActions.classList.add('hidden-el');
        if (addMoreContainer) addMoreContainer.classList.remove('hidden-el');
        if (reorderListContainer) reorderListContainer.classList.remove('hidden-el');
        if (processActions) processActions.classList.remove('hidden-el');
        if (btnBack) btnBack.classList.add('hidden');
    });
}

if (btnClearInput) {
    btnClearInput.addEventListener('click', () => {
        urlInputs.value = '';
        hasProceeded = false;
        parseAndBuildQueue();
        if (initialActions) initialActions.classList.remove('hidden-el');
        if (reorderListContainer) reorderListContainer.classList.add('hidden-el');
        if (processActions) processActions.classList.add('hidden-el');
        if (urlInputs) urlInputs.classList.remove('hidden-el');
        if (addMoreContainer) addMoreContainer.classList.add('hidden-el');
        if (btnBack) btnBack.classList.add('hidden');
        urlInputs.focus();
    });
}

if (btnAddMore) {
    btnAddMore.addEventListener('click', () => {
        hasProceeded = false;
        
        if (addMoreContainer) addMoreContainer.classList.add('hidden-el');
        if (reorderListContainer) reorderListContainer.classList.add('hidden-el');
        if (processActions) processActions.classList.add('hidden-el');
        
        if (urlInputs) {
            urlInputs.value = '';
            urlInputs.classList.remove('hidden-el');
        }
        if (initialActions) initialActions.classList.remove('hidden-el');
        if (btnBack) btnBack.classList.remove('hidden');
        
        urlInputs.focus();
    });
}


// Initial load configuration
async function initializeApp() {
    // Hide queue panel initially
    hideQueuePanel();

    const splashScreen = document.getElementById('splash-screen');
    const splashStatus = splashScreen ? splashScreen.querySelector('.splash-status') : null;

    // Status updates during loading
    if (splashStatus) splashStatus.textContent = "starting engine...";

    setTimeout(() => {
        if (splashStatus) splashStatus.textContent = "starting engine... lift off in 3";
    }, 1500);

    setTimeout(() => {
        if (splashStatus) splashStatus.textContent = "starting engine... lift off in 3... 2";
    }, 2500);

    setTimeout(() => {
        if (splashStatus) splashStatus.textContent = "starting engine... lift off in 3... 2... 1";
    }, 3500);

    setTimeout(() => {
        if (splashStatus) splashStatus.textContent = "Lift off!";
    }, 4500);

    // Hide splash screen after 5 seconds
    setTimeout(() => {
        if (splashScreen) {
            splashScreen.classList.add('fade-out');
        }
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.classList.add('revealed');
        }
        
        try {
            triggerMusicOnStartup();
        } catch (e) {
            console.error("Failed to trigger background music:", e);
        }
    }, 5000);

    let api = null;
    try {
        api = await getPythonApi();
    } catch (e) {
        console.error("Failed to acquire Python API:", e);
    }

    if (api) {
        // 1. Fetch Configuration
        try {
            appConfig = (await api.get_config()) || {};
        } catch (e) {
            console.error("Failed to load appConfig:", e);
        }

        // Apply loaded language
        try {
            const lang = appConfig.language || 'en';
            applyLanguage(lang);
        } catch (e) {
            console.error("Failed to apply language on initialize:", e);
        }

        // 2. Theme colors initialization based on config
        try {
            applyCustomColors();
        } catch (e) {
            console.error("Failed to initialize theme colors:", e);
        }

        // 4. Ensure console section is hidden by default
        try {
            consoleSection.classList.add('hidden');
        } catch (e) {
            console.error("Failed to hide console:", e);
        }

        // 5. Load and display Download Directory path
        try {
            const currentPath = await api.get_download_directory();
            await updateDownloadPathDisplay(api, currentPath);
        } catch (e) {
            console.error("Failed to display download directory path:", e);
        }

        // 6. Wait for splash to finish, then show tutorial if needed
        setTimeout(async () => {
            try {
                if (window.showTutorialIfNeeded) {
                    await window.showTutorialIfNeeded(api, appConfig);
                }
            } catch (err) {
                console.error("Error launching tutorial:", err);
            }
        }, 5400);
    } else {
        // Fallback default setup
        applyLanguage('en');
        applyCustomColors();
        consoleSection.classList.add('hidden');
    }

    // Request OS notification permissions
    try {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    } catch (e) {
        console.error("Failed to request notification permission:", e);
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Stubs to absorb legacy python callbacks safely
window.js_init_yt_playlist = () => {};
window.js_update_yt_playlist_item = () => {};
window.js_update_yt_progress = () => {};

// ===== Welcome Tutorial (first launch only) =====
window.showTutorialIfNeeded = async function(api, appConfig) {
    const STORAGE_KEY = 'rocketdl_tutorial_done';
    const overlay     = document.getElementById('tutorial-overlay');
    const slides      = Array.from(document.querySelectorAll('.tut-slide'));
    const dots        = Array.from(document.querySelectorAll('.tut-dot'));
    const btnNext     = document.getElementById('tut-next');
    const btnPrev     = document.getElementById('tut-prev');
    const btnSkip     = document.getElementById('tut-skip');

    if (!overlay || !slides.length) return;

    // Show only on first launch (checks both localStorage & Python config)
    if (localStorage.getItem(STORAGE_KEY) || (appConfig && appConfig.tutorial_done)) {
        return;
    }

    let current = 0;
    const total = slides.length; // 5 slides (0-4)

    function goTo(index) {
        slides[current].classList.remove('active');
        dots[current].classList.remove('active');
        current = Math.max(0, Math.min(index, total - 1));
        slides[current].classList.add('active');
        dots[current].classList.add('active');

        btnPrev.disabled = current === 0;
        btnNext.textContent = current === total - 1 ? 'Got it 🚀' : 'Next →';
    }

    async function closeTutorial() {
        localStorage.setItem(STORAGE_KEY, '1');
        if (api) {
            try {
                await api.save_config_value('tutorial_done', true);
            } catch (e) {
                console.error("Failed to save tutorial config:", e);
            }
        }
        overlay.style.animation = 'tutFadeIn 0.25s ease reverse forwards';
        setTimeout(() => overlay.classList.add('hidden'), 260);
    }

    // Show tutorial overlay
    overlay.classList.remove('hidden');
    goTo(0);

    btnNext.addEventListener('click', () => {
        if (current === total - 1) { closeTutorial(); return; }
        goTo(current + 1);
    });

    btnPrev.addEventListener('click', () => goTo(current - 1));
    btnSkip.addEventListener('click', closeTutorial);

    // Click on dots to jump
    dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
};
