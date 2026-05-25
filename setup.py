from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

setup(
    name="form_styler",
    version="0.0.1",
    description="Customize field, column, and section styles in Frappe forms",
    author="Frappe Field Styler",
    author_email="support@example.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
)
