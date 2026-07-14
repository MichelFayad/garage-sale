import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final isLoading = authState.isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Log in')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              key: const Key('email_field'),
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            TextField(
              key: const Key('password_field'),
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            if (authState.hasError)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Invalid email or password',
                  style: TextStyle(color: Colors.red),
                ),
              ),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('login_button'),
              onPressed: isLoading
                  ? null
                  : () => ref
                        .read(authControllerProvider.notifier)
                        .login(
                          email: _emailController.text,
                          password: _passwordController.text,
                        ),
              child: isLoading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Log in'),
            ),
            TextButton(
              key: const Key('go_to_register'),
              onPressed: () => context.push('/register'),
              child: const Text('Create account'),
            ),
          ],
        ),
      ),
    );
  }
}
