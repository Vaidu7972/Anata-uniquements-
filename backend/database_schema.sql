-- Ananta Techtonic MySQL Schema
-- As requested for the project

CREATE DATABASE IF NOT EXISTS ananta_techtonic;
USE ananta_techtonic;

CREATE TABLE Users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Wallet (
    wallet_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    total_coins INT DEFAULT 0,
    earned_coins INT DEFAULT 0,
    used_coins INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE Skills (
    skill_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    skill_name VARCHAR(255),
    skill_type ENUM('offered', 'required'),
    skill_grade ENUM('A', 'B', 'C', 'D', 'E'),
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE Trades (
    trade_id INT PRIMARY KEY AUTO_INCREMENT,
    requester_id INT,
    receiver_id INT,
    skills_exchanged TEXT,
    status ENUM('pending', 'accepted', 'completed', 'rejected') DEFAULT 'pending',
    duration_days INT,
    satisfaction ENUM('Excellent', 'Good', 'Average', 'Poor'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE Courses (
    course_id INT PRIMARY KEY AUTO_INCREMENT,
    course_name VARCHAR(255),
    description TEXT,
    coin_price INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Reviews (
    review_id INT PRIMARY KEY AUTO_INCREMENT,
    trade_id INT,
    reviewer_id INT,
    rating INT,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trade_id) REFERENCES Trades(trade_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

select * from Reviews