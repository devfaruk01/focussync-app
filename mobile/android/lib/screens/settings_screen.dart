import 'dart:ui';
import 'package:flutter/material.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _animationController;
  late final Animation<double> _fadeAnimation;
  late final Animation<Offset> _slideAnimation;

  // Mock Settings State
  bool _darkMode = true;
  bool _notifications = true;
  bool _hardMode = false;
  bool _syncEnabled = true;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOut),
    );

    _slideAnimation = Tween<Offset>(begin: const Offset(0, 0.05), end: Offset.zero).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOutCubic),
    );

    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

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
            top: 50,
            left: -100,
            child: _AmbientGlow(color: const Color(0xFF7C3AED).withOpacity(0.25), size: 350),
          ),
          Positioned(
            bottom: -50,
            right: -100,
            child: _AmbientGlow(color: const Color(0xFF3B82F6).withOpacity(0.2), size: 400),
          ),

          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 800),
                child: FadeTransition(
                  opacity: _fadeAnimation,
                  child: SlideTransition(
                    position: _slideAnimation,
                    child: ListView(
                      padding: EdgeInsets.symmetric(
                        horizontal: isWideScreen ? 32.0 : 24.0,
                        vertical: 24.0,
                      ),
                      children: [
                        _buildHeader(theme),
                        const SizedBox(height: 32),
                        
                        _SectionTitle(title: 'Preferences', theme: theme),
                        _SettingsGroup(
                          children: [
                            _SettingsSwitchTile(
                              title: 'Dark Mode',
                              subtitle: 'Use dark theme globally',
                              icon: Icons.dark_mode_rounded,
                              iconColor: const Color(0xFF8B5CF6),
                              value: _darkMode,
                              onChanged: (val) => setState(() => _darkMode = val),
                            ),
                            _SettingsSwitchTile(
                              title: 'Notifications',
                              subtitle: 'Session reminders & alerts',
                              icon: Icons.notifications_rounded,
                              iconColor: const Color(0xFF3B82F6),
                              value: _notifications,
                              onChanged: (val) => setState(() => _notifications = val),
                            ),
                            _SettingsSwitchTile(
                              title: 'Sync Across Devices',
                              subtitle: 'Keep your stats updated',
                              icon: Icons.sync_rounded,
                              iconColor: const Color(0xFF10B981),
                              value: _syncEnabled,
                              onChanged: (val) => setState(() => _syncEnabled = val),
                            ),
                          ],
                        ),

                        const SizedBox(height: 32),
                        _SectionTitle(title: 'Focus Configuration', theme: theme),
                        _SettingsGroup(
                          children: [
                            _SettingsNavigationTile(
                              title: 'Focus Duration',
                              subtitle: 'Default session length',
                              icon: Icons.timer_rounded,
                              iconColor: const Color(0xFFF59E0B),
                              trailingText: '25 min',
                              onTap: () {},
                            ),
                            _SettingsSwitchTile(
                              title: 'Hard Mode',
                              subtitle: 'Enforce strict focus rules',
                              icon: Icons.gpp_maybe_rounded,
                              iconColor: const Color(0xFFF43F5E),
                              value: _hardMode,
                              onChanged: (val) => setState(() => _hardMode = val),
                            ),
                            _SettingsNavigationTile(
                              title: 'Blocked Apps',
                              subtitle: 'Manage restricted applications',
                              icon: Icons.app_blocking_rounded,
                              iconColor: const Color(0xFFEF4444),
                              onTap: () {},
                            ),
                            _SettingsNavigationTile(
                              title: 'Blocked Websites',
                              subtitle: 'Manage restricted domains',
                              icon: Icons.public_off_rounded,
                              iconColor: const Color(0xFF6366F1),
                              onTap: () {},
                            ),
                          ],
                        ),

                        const SizedBox(height: 32),
                        _SectionTitle(title: 'Account', theme: theme),
                        _SettingsGroup(
                          children: [
                            _SettingsNavigationTile(
                              title: 'Profile',
                              subtitle: 'Alex Morgan',
                              icon: Icons.person_rounded,
                              iconColor: const Color(0xFF7C3AED),
                              onTap: () {},
                            ),
                            _SettingsNavigationTile(
                              title: 'Subscription',
                              subtitle: 'FocusSync Pro',
                              icon: Icons.workspace_premium_rounded,
                              iconColor: const Color(0xFFEAB308),
                              onTap: () {},
                            ),
                          ],
                        ),

                        const SizedBox(height: 48),
                        _buildLogoutButton(theme),
                        const SizedBox(height: 48),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(ThemeData theme) {
    return Text(
      'Settings',
      style: theme.textTheme.headlineMedium?.copyWith(
        fontWeight: FontWeight.w800,
        color: Colors.white,
        letterSpacing: -0.5,
      ),
    );
  }

  Widget _buildLogoutButton(ThemeData theme) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () {},
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFF43F5E).withOpacity(0.3), width: 1),
            color: const Color(0xFFF43F5E).withOpacity(0.1),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.logout_rounded, color: Color(0xFFF43F5E)),
              const SizedBox(width: 8),
              Text(
                'Log Out',
                style: theme.textTheme.titleMedium?.copyWith(
                  color: const Color(0xFFF43F5E),
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// --- Components ---

class _SectionTitle extends StatelessWidget {
  final String title;
  final ThemeData theme;

  const _SectionTitle({required this.title, required this.theme});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 16, bottom: 12),
      child: Text(
        title.toUpperCase(),
        style: theme.textTheme.labelMedium?.copyWith(
          color: Colors.white54,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}

class _SettingsGroup extends StatelessWidget {
  final List<Widget> children;

  const _SettingsGroup({required this.children});

  @override
  Widget build(BuildContext context) {
    return _GlassmorphicContainer(
      padding: EdgeInsets.zero,
      child: Column(
        children: children.asMap().entries.map((entry) {
          final index = entry.key;
          final widget = entry.value;
          final isLast = index == children.length - 1;

          return Column(
            children: [
              widget,
              if (!isLast)
                const Divider(
                  height: 1,
                  thickness: 1,
                  color: Colors.white10,
                  indent: 64, // Align with text start
                  endIndent: 16,
                ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

class _SettingsSwitchTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color iconColor;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _SettingsSwitchTile({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.iconColor,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => onChanged(!value),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              _IconContainer(icon: icon, color: iconColor),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              Switch(
                value: value,
                onChanged: onChanged,
                activeColor: Colors.white,
                activeTrackColor: const Color(0xFF7C3AED),
                inactiveThumbColor: Colors.white54,
                inactiveTrackColor: Colors.white10,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SettingsNavigationTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color iconColor;
  final String? trailingText;
  final VoidCallback onTap;

  const _SettingsNavigationTile({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.iconColor,
    this.trailingText,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              _IconContainer(icon: icon, color: iconColor),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailingText != null)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Text(
                    trailingText!,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              const Icon(
                Icons.chevron_right_rounded,
                color: Colors.white38,
                size: 24,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _IconContainer extends StatelessWidget {
  final IconData icon;
  final Color color;

  const _IconContainer({required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(icon, color: color, size: 20),
    );
  }
}

class _GlassmorphicContainer extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;

  const _GlassmorphicContainer({
    required this.child,
    required this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.03),
            borderRadius: BorderRadius.circular(20),
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

class _AmbientGlow extends StatelessWidget {
  final Color color;
  final double size;

  const _AmbientGlow({
    required this.color,
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
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