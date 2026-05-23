import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';

enum TimerState { initial, running, paused }

class FocusScreen extends StatefulWidget {
  const FocusScreen({super.key});

  @override
  State<FocusScreen> createState() => _FocusScreenState();
}

class _FocusScreenState extends State<FocusScreen> with TickerProviderStateMixin {
  static const int _defaultTime = 25 * 60; // 25 minutes
  int _timeRemaining = _defaultTime;
  TimerState _state = TimerState.initial;
  Timer? _timer;
  bool _isHardMode = false;

  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    );
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.05).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  void _startTimer() {
    setState(() {
      _state = TimerState.running;
    });
    _pulseController.repeat(reverse: true);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_timeRemaining > 0) {
        setState(() {
          _timeRemaining--;
        });
      } else {
        _stopTimer();
        // Here we would normally trigger a notification or completion event
      }
    });
  }

  void _pauseTimer() {
    _timer?.cancel();
    setState(() {
      _state = TimerState.paused;
    });
    _pulseController.stop();
  }

  void _stopTimer() {
    _timer?.cancel();
    setState(() {
      _state = TimerState.initial;
      _timeRemaining = _defaultTime;
    });
    _pulseController.reset();
  }

  String get _formattedTime {
    final minutes = (_timeRemaining ~/ 60).toString().padLeft(2, '0');
    final seconds = (_timeRemaining % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  double get _progress => 1.0 - (_timeRemaining / _defaultTime);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isWideScreen = MediaQuery.sizeOf(context).width > 600;

    return Scaffold(
      backgroundColor: const Color(0xFF09090E),
      body: Stack(
        children: [
          // Ambient Glows
          Positioned(
            top: -50,
            left: -100,
            child: _AmbientGlow(
              color: const Color(0xFF7C3AED).withOpacity(_state == TimerState.running ? 0.6 : 0.3),
              size: 400,
            ),
          ),
          Positioned(
            bottom: -100,
            right: -100,
            child: _AmbientGlow(
              color: const Color(0xFF3B82F6).withOpacity(_state == TimerState.running ? 0.5 : 0.2),
              size: 450,
            ),
          ),

          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 800),
                child: Column(
                  children: [
                    _buildHeader(theme),
                    Expanded(
                      child: SingleChildScrollView(
                        padding: EdgeInsets.symmetric(
                          horizontal: isWideScreen ? 48.0 : 24.0,
                          vertical: 24.0,
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const SizedBox(height: 24),
                            _buildTimerDisplay(theme),
                            const SizedBox(height: 48),
                            _buildMotivationalText(theme),
                            const SizedBox(height: 48),
                            _buildControls(),
                            const SizedBox(height: 48),
                            _buildSessionStats(theme),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'Focus Session',
            style: theme.textTheme.titleLarge?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.5,
            ),
          ),
          _GlassmorphicContainer(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            borderRadius: 20,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.gpp_maybe_rounded, size: 16, color: Color(0xFFF43F5E)),
                const SizedBox(width: 8),
                Text(
                  'Hard Mode',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: Colors.white70,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 24,
                  width: 36,
                  child: FittedBox(
                    fit: BoxFit.fill,
                    child: Switch(
                      value: _isHardMode,
                      onChanged: _state == TimerState.initial
                          ? (val) => setState(() => _isHardMode = val)
                          : null, // Disable toggle during active session
                      activeColor: const Color(0xFFF43F5E),
                      activeTrackColor: const Color(0xFFF43F5E).withOpacity(0.3),
                      inactiveTrackColor: Colors.white10,
                      inactiveThumbColor: Colors.white54,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimerDisplay(ThemeData theme) {
    return AnimatedBuilder(
      animation: _pulseAnimation,
      builder: (context, child) {
        return Transform.scale(
          scale: _state == TimerState.running ? _pulseAnimation.value : 1.0,
          child: _GlassmorphicContainer(
            padding: const EdgeInsets.all(32),
            borderRadius: 300, // Make it circular
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 280,
                  height: 280,
                  child: CustomPaint(
                    painter: _TimerPainter(
                      progress: _progress,
                      backgroundColor: Colors.white.withOpacity(0.05),
                      gradientColors: const [
                        Color(0xFF7C3AED),
                        Color(0xFF3B82F6),
                        Color(0xFF8B5CF6),
                      ],
                    ),
                  ),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _formattedTime,
                      style: theme.textTheme.displayLarge?.copyWith(
                        fontSize: 72,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        fontFeatures: const [FontFeature.tabularFigures()],
                        letterSpacing: -2,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        _state == TimerState.initial
                            ? 'Ready to focus'
                            : _state == TimerState.paused
                                ? 'Paused'
                                : 'Deep Work',
                        style: theme.textTheme.titleSmall?.copyWith(
                          color: _state == TimerState.paused
                              ? Colors.white54
                              : const Color(0xFFC4B5FD),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildMotivationalText(ThemeData theme) {
    String text = "Eliminate distractions. Setup your environment.";
    if (_state == TimerState.running) {
      text = _isHardMode
          ? "Hard mode active. Stay perfectly focused."
          : "You're doing great. Keep the momentum going.";
    } else if (_state == TimerState.paused) {
      text = "Take a breath, but don't lose focus.";
    }

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 500),
      child: Text(
        text,
        key: ValueKey<String>(text),
        textAlign: TextAlign.center,
        style: theme.textTheme.bodyLarge?.copyWith(
          color: Colors.white54,
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  Widget _buildControls() {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      transitionBuilder: (child, animation) => ScaleTransition(scale: animation, child: child),
      child: _state == TimerState.initial
          ? _buildStartButton()
          : _buildActiveControls(),
    );
  }

  Widget _buildStartButton() {
    return Container(
      key: const ValueKey('start_btn'),
      width: 200,
      height: 64,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(32),
        gradient: const LinearGradient(
          colors: [Color(0xFF7C3AED), Color(0xFF3B82F6)],
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF7C3AED).withOpacity(0.4),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(32),
          onTap: _startTimer,
          child: const Center(
            child: Text(
              'Start Focus',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold,
                letterSpacing: 1,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildActiveControls() {
    return Row(
      key: const ValueKey('active_controls'),
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _GlassmorphicIconButton(
          icon: Icons.stop_rounded,
          color: const Color(0xFFF43F5E),
          onTap: _stopTimer,
          size: 64,
          iconSize: 32,
        ),
        const SizedBox(width: 32),
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              colors: [Color(0xFF7C3AED), Color(0xFF3B82F6)],
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF7C3AED).withOpacity(0.4),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: _state == TimerState.running ? _pauseTimer : _startTimer,
              child: Icon(
                _state == TimerState.running ? Icons.pause_rounded : Icons.play_arrow_rounded,
                color: Colors.white,
                size: 40,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSessionStats(ThemeData theme) {
    return _GlassmorphicContainer(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      borderRadius: 24,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _buildStatItem(theme, Icons.check_circle_outline, 'Round', '1/4'),
          Container(width: 1, height: 30, color: Colors.white10),
          _buildStatItem(theme, Icons.flag_outlined, 'Goal', '2h 00m'),
          Container(width: 1, height: 30, color: Colors.white10),
          _buildStatItem(theme, Icons.local_fire_department_outlined, 'Streak', '12'),
        ],
      ),
    );
  }

  Widget _buildStatItem(ThemeData theme, IconData icon, String label, String value) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(icon, size: 14, color: Colors.white54),
            const SizedBox(width: 6),
            Text(
              label,
              style: theme.textTheme.labelMedium?.copyWith(
                color: Colors.white54,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          value,
          style: theme.textTheme.titleMedium?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }
}

// --- Utility/Shared Widgets ---

class _GlassmorphicContainer extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double borderRadius;

  const _GlassmorphicContainer({
    required this.child,
    required this.padding,
    this.borderRadius = 24.0,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.03),
            borderRadius: BorderRadius.circular(borderRadius),
            border: Border.all(
              color: Colors.white.withOpacity(0.08),
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

class _GlassmorphicIconButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final double size;
  final double iconSize;

  const _GlassmorphicIconButton({
    required this.icon,
    required this.color,
    required this.onTap,
    this.size = 56.0,
    this.iconSize = 24.0,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(size / 2),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withOpacity(0.05),
            border: Border.all(color: Colors.white.withOpacity(0.1), width: 1),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onTap,
              child: Icon(icon, color: color, size: iconSize),
            ),
          ),
        ),
      ),
    );
  }
}

class _AmbientGlow extends StatelessWidget {
  final Color color;
  final double size;

  const _AmbientGlow({
    required this.color,
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 1000),
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [
            color,
            color.withOpacity(0.0),
          ],
          stops: const [0.0, 1.0],
        ),
      ),
    );
  }
}

// --- Custom Painter for Timer ---

class _TimerPainter extends CustomPainter {
  final double progress;
  final Color backgroundColor;
  final List<Color> gradientColors;

  _TimerPainter({
    required this.progress,
    required this.backgroundColor,
    required this.gradientColors,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2;
    const strokeWidth = 14.0;

    // Draw background track
    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;
    canvas.drawCircle(center, radius, bgPaint);

    // Draw progress gradient arc
    final progressPaint = Paint()
      ..shader = SweepGradient(
        colors: gradientColors,
        startAngle: -math.pi / 2,
        endAngle: 3 * math.pi / 2,
      ).createShader(Rect.fromCircle(center: center, radius: radius))
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = strokeWidth;

    // Flutter starts angles from 3 o'clock. -pi/2 is 12 o'clock.
    const startAngle = -math.pi / 2;
    final sweepAngle = 2 * math.pi * progress;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      progressPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _TimerPainter oldDelegate) {
    return oldDelegate.progress != progress ||
           oldDelegate.backgroundColor != backgroundColor ||
           oldDelegate.gradientColors != gradientColors;
  }
}