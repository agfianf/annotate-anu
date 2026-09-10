/**
 * Every icon used by the app, backed by HugeIcons.
 *
 * Named after their lucide-react predecessors so call sites keep reading the same way.
 * The glyphs draw with `currentColor`, so the existing Tailwind `text-*` and `w-* h-*`
 * classes still drive colour and size.
 *
 * The trailing argument is the hover gesture (see `IconMotion`); it is chosen to match
 * what the icon does — refresh spins, download drops, delete recoils — and defaults to a
 * plain lift. The motion itself lives in `index.css`.
 */
import {
  Alert02Icon,
  AlertCircleIcon,
  Archive02Icon,
  ArrowDown02Icon,
  ArrowExpand01Icon,
  ArrowLeft02Icon,
  ArrowLeftRightIcon,
  ArrowRight02Icon,
  ArrowShrink01Icon,
  ArrowUp02Icon,
  ArrowUpDownIcon,
  AspectRatioIcon,
  BalanceScaleIcon,
  BookOpen01Icon,
  BoxesIcon,
  BoxIcon,
  Brain03Icon,
  Briefcase01Icon,
  Calendar04Icon,
  Camera02Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ChartColumnIcon,
  ChartScatterIcon,
  CheckIcon,
  CheckmarkCircle02Icon,
  CheckmarkSquare01Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  Clock01Icon,
  CloudIcon,
  CloudOffIcon,
  CloudUploadIcon,
  CodeIcon,
  ContrastIcon,
  CopyIcon,
  CpuIcon,
  CrownIcon,
  Cursor01Icon,
  Cursor02Icon,
  DatabaseIcon,
  Delete02Icon,
  Download01Icon,
  DropletIcon,
  Edit02Icon,
  Edit03Icon,
  EqualSignIcon,
  EraserIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  File01Icon,
  FileBracesIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FilterIcon,
  FingerPrintIcon,
  FlaskConicalIcon,
  FloppyDiskIcon,
  FocusIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FolderUploadIcon,
  GitBranchIcon,
  GraduationCapIcon,
  Grid2X2Icon,
  Grid3X3Icon,
  GripIcon,
  GripVerticalIcon,
  HardDriveIcon,
  HelpCircleIcon,
  HexagonIcon,
  HistoryIcon,
  Home01Icon,
  Image01Icon,
  ImageOffIcon,
  ImagesIcon,
  InboxIcon,
  InfoIcon,
  KeyboardIcon,
  Layers01Icon,
  LayoutGridIcon,
  LayoutPanelTopIcon,
  LightbulbIcon,
  LinkIcon,
  ListIcon,
  ListTodoIcon,
  LoaderCircleIcon,
  Location01Icon,
  LogInIcon,
  LogOutIcon,
  Menu01Icon,
  MinusSignIcon,
  MoreVerticalIcon,
  PaintBrush01Icon,
  PaletteIcon,
  PentagonIcon,
  PercentIcon,
  PieChart01Icon,
  PlayIcon,
  Plug01Icon,
  PlusSignIcon,
  RedoIcon,
  RefreshIcon,
  RotateCcwIcon,
  RulerIcon,
  ScanIcon,
  ScissorsIcon,
  Search01Icon,
  Settings01Icon,
  ShapesIcon,
  Shield01Icon,
  ShieldCheckIcon,
  ShieldXIcon,
  ShuffleIcon,
  SlidersHorizontalIcon,
  SortByDown01Icon,
  SparklesIcon,
  SquareIcon,
  SquareSplitVerticalIcon,
  Sun01Icon,
  Table01Icon,
  Tag01Icon,
  TagsIcon,
  Target01Icon,
  TestTube01Icon,
  ThumbsDownIcon,
  TrendingUpIcon,
  TrophyIcon,
  TypeIcon,
  UndoIcon,
  Upload01Icon,
  UserCircleIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
  WandSparklesIcon,
  Wrench01Icon,
  ZapIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@hugeicons/core-free-icons';

import { icon } from './icon-factory';

export type { IconProps, IconComponent, IconMotion } from './icon-factory';

export const AlertCircle = icon(AlertCircleIcon, 'AlertCircle', 'wiggle');
export const AlertTriangle = icon(Alert02Icon, 'AlertTriangle', 'wiggle');
export const Archive = icon(Archive02Icon, 'Archive');
export const ArrowDown = icon(ArrowDown02Icon, 'ArrowDown', 'down');
export const ArrowLeft = icon(ArrowLeft02Icon, 'ArrowLeft', 'left');
export const ArrowLeftRight = icon(ArrowLeftRightIcon, 'ArrowLeftRight');
export const ArrowRight = icon(ArrowRight02Icon, 'ArrowRight', 'right');
export const ArrowUp = icon(ArrowUp02Icon, 'ArrowUp', 'up');
export const ArrowUpDown = icon(ArrowUpDownIcon, 'ArrowUpDown');
export const BarChart3 = icon(ChartColumnIcon, 'BarChart3');
export const BookOpen = icon(BookOpen01Icon, 'BookOpen');
export const Box = icon(BoxIcon, 'Box');
export const Boxes = icon(BoxesIcon, 'Boxes');
export const Brain = icon(Brain03Icon, 'Brain');
export const Briefcase = icon(Briefcase01Icon, 'Briefcase');
export const Calendar = icon(Calendar04Icon, 'Calendar');
export const Camera = icon(Camera02Icon, 'Camera');
export const Check = icon(CheckIcon, 'Check', 'pop');
export const CheckCircle2 = icon(CheckmarkCircle02Icon, 'CheckCircle2', 'pop');
export const CheckCircle = icon(CheckmarkCircle02Icon, 'CheckCircle', 'pop');
export const CheckSquare = icon(CheckmarkSquare01Icon, 'CheckSquare', 'pop');
export const ChevronDown = icon(ChevronDownIcon, 'ChevronDown', 'down');
export const ChevronLeft = icon(ChevronLeftIcon, 'ChevronLeft', 'left');
export const ChevronRight = icon(ChevronRightIcon, 'ChevronRight', 'right');
export const ChevronUp = icon(ChevronUpIcon, 'ChevronUp', 'up');
export const Circle = icon(CircleIcon, 'Circle');
export const ClipboardCheck = icon(ClipboardCheckIcon, 'ClipboardCheck');
export const ClipboardList = icon(ClipboardListIcon, 'ClipboardList');
export const Clock = icon(Clock01Icon, 'Clock');
export const Cloud = icon(CloudIcon, 'Cloud');
export const CloudOff = icon(CloudOffIcon, 'CloudOff');
export const Code2 = icon(CodeIcon, 'Code2');
export const Contrast = icon(ContrastIcon, 'Contrast');
export const Copy = icon(CopyIcon, 'Copy');
export const Cpu = icon(CpuIcon, 'Cpu');
export const Crown = icon(CrownIcon, 'Crown', 'pop');
export const Database = icon(DatabaseIcon, 'Database');
export const Delete = icon(EraserIcon, 'Delete', 'wiggle');
export const Download = icon(Download01Icon, 'Download', 'down');
export const Droplet = icon(DropletIcon, 'Droplet');
export const Edit2 = icon(Edit02Icon, 'Edit2');
export const Edit3 = icon(Edit03Icon, 'Edit3');
export const Equal = icon(EqualSignIcon, 'Equal');
export const ExternalLink = icon(ExternalLinkIcon, 'ExternalLink', 'right');
export const Eye = icon(EyeIcon, 'Eye');
export const EyeOff = icon(EyeOffIcon, 'EyeOff');
export const File = icon(File01Icon, 'File');
export const FileJson = icon(FileBracesIcon, 'FileJson');
export const FileSpreadsheet = icon(FileSpreadsheetIcon, 'FileSpreadsheet');
export const FileText = icon(FileTextIcon, 'FileText');
export const Filter = icon(FilterIcon, 'Filter');
export const Fingerprint = icon(FingerPrintIcon, 'Fingerprint');
export const FlaskConical = icon(FlaskConicalIcon, 'FlaskConical');
export const Focus = icon(FocusIcon, 'Focus');
export const Folder = icon(FolderClosedIcon, 'Folder');
export const FolderOpen = icon(FolderOpenIcon, 'FolderOpen');
export const FolderPlus = icon(FolderPlusIcon, 'FolderPlus');
export const FolderUp = icon(FolderUploadIcon, 'FolderUp');
export const GitBranch = icon(GitBranchIcon, 'GitBranch');
export const GitCompare = icon(ChartScatterIcon, 'GitCompare');
export const GraduationCap = icon(GraduationCapIcon, 'GraduationCap');
export const Grid2X2 = icon(Grid2X2Icon, 'Grid2X2');
export const Grid3X3 = icon(Grid3X3Icon, 'Grid3X3');
export const Grip = icon(GripIcon, 'Grip');
export const GripVertical = icon(GripVerticalIcon, 'GripVertical');
export const HardDrive = icon(HardDriveIcon, 'HardDrive');
export const HelpCircle = icon(HelpCircleIcon, 'HelpCircle');
export const Hexagon = icon(HexagonIcon, 'Hexagon');
export const History = icon(HistoryIcon, 'History', 'spin');
export const Home = icon(Home01Icon, 'Home');
export const Image = icon(Image01Icon, 'Image');
export const ImageOff = icon(ImageOffIcon, 'ImageOff');
export const Images = icon(ImagesIcon, 'Images');
export const Inbox = icon(InboxIcon, 'Inbox');
export const Info = icon(InfoIcon, 'Info');
export const Keyboard = icon(KeyboardIcon, 'Keyboard');
export const Layers = icon(Layers01Icon, 'Layers');
export const LayoutGrid = icon(LayoutGridIcon, 'LayoutGrid');
export const LayoutPanelTop = icon(LayoutPanelTopIcon, 'LayoutPanelTop');
export const Lightbulb = icon(LightbulbIcon, 'Lightbulb');
export const Link = icon(LinkIcon, 'Link');
export const List = icon(ListIcon, 'List');
export const ListTodo = icon(ListTodoIcon, 'ListTodo');
export const Loader2 = icon(LoaderCircleIcon, 'Loader2', 'none');
export const LogIn = icon(LogInIcon, 'LogIn', 'right');
export const LogOut = icon(LogOutIcon, 'LogOut', 'right');
export const MapPin = icon(Location01Icon, 'MapPin');
export const Maximize2 = icon(ArrowExpand01Icon, 'Maximize2');
export const Menu = icon(Menu01Icon, 'Menu');
export const Minimize2 = icon(ArrowShrink01Icon, 'Minimize2');
export const Minus = icon(MinusSignIcon, 'Minus');
export const MoreVertical = icon(MoreVerticalIcon, 'MoreVertical');
export const MousePointer2 = icon(Cursor02Icon, 'MousePointer2');
export const MousePointer = icon(Cursor01Icon, 'MousePointer');
export const Paintbrush = icon(PaintBrush01Icon, 'Paintbrush');
export const Palette = icon(PaletteIcon, 'Palette');
export const Pentagon = icon(PentagonIcon, 'Pentagon');
export const Percent = icon(PercentIcon, 'Percent');
export const PieChart = icon(PieChart01Icon, 'PieChart');
export const Play = icon(PlayIcon, 'Play', 'right');
export const Plug = icon(Plug01Icon, 'Plug');
export const Plus = icon(PlusSignIcon, 'Plus', 'pop');
export const Ratio = icon(AspectRatioIcon, 'Ratio');
export const RatioIcon = icon(AspectRatioIcon, 'RatioIcon');
export const Redo = icon(RedoIcon, 'Redo', 'right');
export const RefreshCw = icon(RefreshIcon, 'RefreshCw', 'spin');
export const RotateCcw = icon(RotateCcwIcon, 'RotateCcw', 'spin');
export const Ruler = icon(RulerIcon, 'Ruler');
export const Save = icon(FloppyDiskIcon, 'Save');
export const Scale = icon(BalanceScaleIcon, 'Scale');
export const Scan = icon(ScanIcon, 'Scan', 'pop');
export const Scissors = icon(ScissorsIcon, 'Scissors');
export const Search = icon(Search01Icon, 'Search', 'pop');
export const Settings2 = icon(SlidersHorizontalIcon, 'Settings2');
export const Settings = icon(Settings01Icon, 'Settings', 'spin');
export const Shapes = icon(ShapesIcon, 'Shapes');
export const ShieldCheck = icon(ShieldCheckIcon, 'ShieldCheck');
export const Shield = icon(Shield01Icon, 'Shield');
export const ShieldX = icon(ShieldXIcon, 'ShieldX', 'wiggle');
export const Shuffle = icon(ShuffleIcon, 'Shuffle', 'spin');
export const SlidersHorizontal = icon(SlidersHorizontalIcon, 'SlidersHorizontal');
export const SortDesc = icon(SortByDown01Icon, 'SortDesc');
export const Sparkles = icon(SparklesIcon, 'Sparkles', 'pop');
export const SplitSquareVertical = icon(SquareSplitVerticalIcon, 'SplitSquareVertical');
export const Square = icon(SquareIcon, 'Square');
export const Sun = icon(Sun01Icon, 'Sun');
export const Table2 = icon(Table01Icon, 'Table2');
export const Tags = icon(TagsIcon, 'Tags');
export const Tag = icon(Tag01Icon, 'Tag');
export const Target = icon(Target01Icon, 'Target');
export const TestTube2 = icon(TestTube01Icon, 'TestTube2');
export const ThumbsDown = icon(ThumbsDownIcon, 'ThumbsDown', 'pop');
export const Trash2 = icon(Delete02Icon, 'Trash2', 'wiggle');
export const TrendingUp = icon(TrendingUpIcon, 'TrendingUp', 'up');
export const Trophy = icon(TrophyIcon, 'Trophy', 'pop');
export const Type = icon(TypeIcon, 'Type');
export const Undo = icon(UndoIcon, 'Undo', 'left');
export const UploadCloud = icon(CloudUploadIcon, 'UploadCloud', 'up');
export const Upload = icon(Upload01Icon, 'Upload', 'up');
export const UserCircle = icon(UserCircleIcon, 'UserCircle');
export const UserPlus = icon(UserPlusIcon, 'UserPlus');
export const Users = icon(UsersIcon, 'Users');
export const User = icon(UserIcon, 'User');
export const Wand2 = icon(WandSparklesIcon, 'Wand2', 'pop');
export const Wrench = icon(Wrench01Icon, 'Wrench');
export const X = icon(Cancel01Icon, 'X', 'wiggle');
export const XCircle = icon(CancelCircleIcon, 'XCircle', 'wiggle');
export const Zap = icon(ZapIcon, 'Zap', 'pop');
export const ZoomIn = icon(ZoomInIcon, 'ZoomIn', 'pop');
export const ZoomOut = icon(ZoomOutIcon, 'ZoomOut', 'pop');
